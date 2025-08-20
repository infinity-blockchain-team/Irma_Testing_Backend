require('dotenv').config();
const express=require('express');
const app=express();
const cors=require("cors");
app.use(cors())

const {RecordSold,TokenBoughtRecord,TransactionRecord}=require("./model/model")
const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
// const connection = new Connection("https://api.devnet.solana.com", "confirmed");
// const TREASURY_WALLET = '5pTPVvQeeEY1RxdN6GEoVTLkQNc7yqSNADFrzTAJhCN4';
const TREASURY_WALLET = 'CZtRGpVj1V98uBYu2XBXik5Yd4RpmKbkcU5sAZt9Wn7v';
// const TREASURY_WALLET = 'GdJ3xQmw68L8r4crfLu7eigoCFvfL6pAvNL9ETn5JBy8';

const PORT=process.env.PORT || 5000;
require('./conn/conn');


app.use(express.json());


app.get("/",(req,res)=>{
    res.send("Get request recieved");
})


// async function verifySolanaTransaction(txid, userWallet, expectedAmount) {
//   try {
//     const tx = await connection.getParsedTransaction(txid, { commitment: "confirmed" });
   

//     if (!tx) {
//       return { status: false, message: "Transaction not found or not yet confirmed" };
//     }

//     const transferInstruction = tx.transaction.message.instructions.find(i =>
//       i.parsed?.type === "transfer" &&
//       i.parsed.info.source === userWallet &&
//       i.parsed.info.destination === TREASURY_WALLET
      
//     );

//     if (!transferInstruction) {
//       return { status: false, message: "No valid transfer to treasury found in transaction" };
//     }

//      console.log("Type:", transferInstruction.parsed?.type);
//   console.log("Source:", transferInstruction.parsed?.info?.source);
//   console.log("Destination:", transferInstruction.parsed?.info?.destination);

//     const lamports = transferInstruction.parsed.info.lamports;
//     const amountInSOL = lamports / 1e9;

//     if (amountInSOL < expectedAmount) {
//       return { status: false, message: `Transferred amount (${amountInSOL} SOL) is less than expected (${expectedAmount} SOL)` };
//     }

//     return { status: true, message: "Transaction verified", confirmedAmount: amountInSOL };

//   } catch (error) {
//     console.error("Error verifying transaction:", error);
//     return { status: false, message: "Internal error during verification" };
//   }
// }


// async function verifySolanaTransaction(txid, userWallet, expectedAmount, maxRetries = 10, delayMs = 2000) {
//   try {
//     let tx = null;
//     for (let i = 0; i < maxRetries; i++) {
//       tx = await connection.getParsedTransaction(txid, { commitment: "confirmed" });
//       if (tx) break;
//       await new Promise(res => setTimeout(res, delayMs));
//     }

//     if (!tx) {
//       return { status: false, message: "Transaction not found after waiting" };
//     }

//     const transferInstruction = tx.transaction.message.instructions.find(i =>
//       i.parsed?.type === "transfer" &&
//       i.parsed.info.source === userWallet &&
//       i.parsed.info.destination === TREASURY_WALLET
//     );

//     if (!transferInstruction) {
//       return { status: false, message: "No valid transfer to treasury found in transaction" };
//     }

//     const lamports = transferInstruction.parsed.info.lamports;
//     const amountInSOL = lamports / 1e9;

//     if (amountInSOL < expectedAmount) {
//       return { status: false, message: `Transferred amount (${amountInSOL} SOL) is less than expected (${expectedAmount} SOL)` };
//     }

//     return { status: true, message: "Transaction verified", confirmedAmount: amountInSOL };

//   } catch (error) {
//     console.error("Error verifying transaction:", error);
//     return { status: false, message: "Internal error during verification" };
//   }
// }



async function verifySolanaTransaction(txid, userWallet, expectedAmount, maxRetries = 30, initialDelayMs = 1000) {
  try {
    // Step 1: Poll for transaction confirmation using getSignatureStatuses
    let status = null;
    let retryCount = 0;
    let delay = initialDelayMs;

    while (retryCount < maxRetries) {
      const statuses = await connection.getSignatureStatuses([txid], { searchTransactionHistory: true });
      status = statuses.value[0];

      if (status !== null) {
        if (status.err) {
          console.log(`Transaction failed with error: ${JSON.stringify(status.err)}`);
          return { status: false, message: "Transaction failed on-chain" };
        }
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          console.log(`Transaction confirmed in slot ${status.slot} with status: ${status.confirmationStatus}`);
          break; // Proceed to parsing
        }
      }

      // Not found or not yet confirmed; retry with backoff
      console.log(`Transaction ${txid} not confirmed yet (attempt ${retryCount + 1}/${maxRetries}). Waiting ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
      retryCount++;
      delay = Math.min(delay * 1.5, 5000); // Exponential backoff, cap at 5s
    }

    if (status === null || status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') {
      return { status: false, message: "Transaction not confirmed after max retries (may be dropped or expired)" };
    }

    // Step 2: Once confirmed, fetch parsed transaction details
    const tx = await connection.getParsedTransaction(txid, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });

    if (!tx) {
      return { status: false, message: "Parsed transaction not found (unexpected after confirmation)" };
    }

    const transferInstruction = tx.transaction.message.instructions.find(i =>
      i.parsed?.type === "transfer" &&
      i.parsed.info.source === userWallet &&
      i.parsed.info.destination === TREASURY_WALLET
    );

    if (!transferInstruction) {
      console.log("No matching transfer instruction found. Full instructions:", JSON.stringify(tx.transaction.message.instructions));
      return { status: false, message: "No valid transfer to treasury found in transaction" };
    }

    console.log("Transfer details:", {
      type: transferInstruction.parsed?.type,
      source: transferInstruction.parsed?.info?.source,
      destination: transferInstruction.parsed?.info?.destination,
      lamports: transferInstruction.parsed?.info?.lamports
    });

    const lamports = transferInstruction.parsed.info.lamports;
    const amountInSOL = lamports / 1e9;

    if (amountInSOL < expectedAmount) {
      return { status: false, message: `Transferred amount (${amountInSOL} SOL) is less than expected (${expectedAmount} SOL)` };
    }

    return { status: true, message: "Transaction verified", confirmedAmount: amountInSOL };

  } catch (error) {
    console.error("Error verifying transaction:", error);
    if (error.response && error.response.status === 429) {
      // Handle rate limit specifically (e.g., retry after delay)
      console.log("Rate limit hit; consider switching to a dedicated RPC provider.");
    }
    return { status: false, message: "Internal error during verification" };
  }
}



app.post("/storeSolRecievedAndTokenSold",async (req,res)=>{
    const { recievedSol, soldTokens ,txid
,senderAddress,
expectedAmount} = req.body;

console.log(req.body);

  if (typeof recievedSol !== 'number' || typeof soldTokens !== 'number') {
    return res.status(400).json({status: false, message: 'Invalid input. Both fields must be numbers.' });
  }
  if (!txid || !senderAddress || typeof expectedAmount !== 'number') {
  return res.status(400).json({ status: false, message: 'Invalid transaction details' });
}
  try {
   const alreadyExists = await TransactionRecord.findOne({ txid });
    if (alreadyExists) {
      return res.status(400).json({ status: false, message: "Duplicate transaction", txid });
    }


   let result=await verifySolanaTransaction(txid, senderAddress, expectedAmount);

   console.log(result)
if(result.status){
    let record = await RecordSold.findOne();

    if (!record) {
      record = new RecordSold({ recievedSol, soldTokens });
    } else {
      record.recievedSol += recievedSol;
      record.soldTokens += soldTokens;
    }

    await record.save();
    res.status(200).json({ status: true, data: record,messsage:'Successfuly stored record'});
}
else{
   return res.status(400).json({ status: false, message: "Transaction verification failed" });
  }
}
   catch (err) {
    console.error('Error in /record-sold:', err);
    res.status(500).json({ status: false,messsage:'Something went wrong' });
  }


})

app.get("/getSoldTokens", async (req, res) => {
  try {
  
    const record = await RecordSold.findOne();

    if (!record) {
      return res.status(200).json({
        status: true,
        message: "No records found yet.",
        data: {
          recievedSol: 0,
          soldTokens: 0
        }
      });
    }

    res.status(200).json({
      status: true,
      message: "Fetched sold tokens successfully.",
      data: {
        recievedSol: record.recievedSol,
        soldTokens: record.soldTokens
      }
    });

  } catch (err) {
    console.error('Error in /getSoldTokens:', err);
    res.status(500).json({ status: false, message: 'Server error while fetching tokens.' });
  }
});



app.post("/api/addPurchase", async (req, res) => {
  try {

    const { tokenBought, txid,  address, expectedAmount } = req.body;
    
    console.log(txid);
console.log("hello world")
    if (!txid || !address || typeof expectedAmount !== 'number') {
      return res.status(400).json({ status: false, message: 'Invalid transaction details' });
    }

    const alreadyExists = await TransactionRecord.findOne({ txid });
    if (alreadyExists) {
      return res.status(400).json({ status: false, message: "Duplicate transaction", txid });
    }


    const result = await verifySolanaTransaction(txid, address, expectedAmount);
    if (!result.status) {
      return res.status(400).json({ status: false, message: "Transaction verification failed" });
    }

    if (!tokenBought ) {
      return res.status(400).json({ status: false, message: "Token bought are required" });
    }
    if (isNaN(tokenBought) || tokenBought <= 0) {
      return res.status(400).json({ status: false, message: "Token bought must be a positive number" });
    }

    const existingRecord = await TokenBoughtRecord.findOne({ address });
    if (existingRecord) {
      existingRecord.tokenBought += tokenBought;
      await existingRecord.save();
    } else {
      const newRecord = new TokenBoughtRecord({ address, tokenBought });
      await newRecord.save();
    }


    await TransactionRecord.create({ txid });

    return res.status(200).json({ status: true, message: "Purchase recorded successfully" });

  } catch (error) {
    console.error("Error in addPurchase:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
});






app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`)

})
