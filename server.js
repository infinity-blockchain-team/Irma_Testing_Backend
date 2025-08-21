require('dotenv').config();
const express=require('express');
const app=express();
const cors=require("cors");
app.use(cors())

const {RecordSold,TokenBoughtRecord,TransactionRecord}=require("./model/model")
const { Connection, PublicKey } = require('@solana/web3.js');

// const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const connection = new Connection("https://solana-mainnet.g.alchemy.com/v2/5pga0rTwblyZSAnBL_lIHdl2SVGKc4xe", "confirmed");
// const connection = new Connection("https://api.devnet.solana.com", "confirmed");
// const TREASURY_WALLET = '5pTPVvQeeEY1RxdN6GEoVTLkQNc7yqSNADFrzTAJhCN4';
const TREASURY_WALLET = 'CZtRGpVj1V98uBYu2XBXik5Yd4RpmKbkcU5sAZt9Wn7v';
// const  usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'   for usdc devnet
const  usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const  usdtMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
// const TREASURY_WALLET = 'GdJ3xQmw68L8r4crfLu7eigoCFvfL6pAvNL9ETn5JBy8';

const { getAssociatedTokenAddress } = require('@solana/spl-token');


const PORT=process.env.PORT || 5000;
require('./conn/conn');


app.use(express.json());


app.get("/",(req,res)=>{
    res.send("Get request recieved");
})


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
          break; 
        }
      }

   
      console.log(`Transaction ${txid} not confirmed yet (attempt ${retryCount + 1}/${maxRetries}). Waiting ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
      retryCount++;
      delay = Math.min(delay * 1.5, 5000); 
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

async function waitForParsedTransaction(txid, connection, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    const tx = await connection.getParsedTransaction(txid, { commitment: "confirmed" });
    if (tx) return tx;
    console.log(`⏳ Waiting for transaction confirmation (${i + 1}/${maxRetries})`);
    await new Promise(res => setTimeout(res, 2000)); // 2 sec wait
  }
  return null;
}


// async function verifyUsdtTransaction(
//   txid,
//   userWallet,
//   expectedAmount

// ) {
//   try {


  
//     const treasuryTokenAccount = await getAssociatedTokenAddress(
//       new PublicKey(usdtMint),
//       new PublicKey(TREASURY_WALLET),
//       false
//     );

//     const tx = await waitForParsedTransaction(txid, connection, 5);
    
//     if (!tx) {
//       return { status: false, message: 'Transaction not confirmed after retries' };
//     }


//     const instructions = tx.transaction.message.instructions;

//     const tokenTransfer = instructions.find(i =>
//       i.program === 'spl-token' &&
//       i.parsed?.type === 'transfer' &&
//       i.parsed.info?.authority === userWallet &&
//       i.parsed.info?.destination === treasuryTokenAccount.toBase58()
//     );
// //  console.log(instructions)
//    console.log("Type:", tokenTransfer.parsed?.type);
//   console.log("Source:", tokenTransfer.parsed?.info?.authority);
//   console.log("Destination:", tokenTransfer.parsed?.info?.destination);
//     if (!tokenTransfer) {
//       return { status: false, message: ' No valid USDC transfer to treasury found' };
//     }


//     const amountRaw = tokenTransfer.parsed.info.amount;
//     const amount = parseFloat(amountRaw) / 1e6; // USDT = 6 decimals

//     if (amount < expectedAmount) {
//       return {
//         status: false,
//         message: ` Transferred amount ${amount} < expected ${expectedAmount}`
//       };
//     }

//     return {
//       status: true,
//       message: ' USDT transaction verified',
//       confirmedAmount: amount
//     };

//   } catch (error) {
//     console.error(' Error verifying USDT transaction:', error);
//     return { status: false, message: ' Internal server error during verification' };
//   }
// }


async function verifyUsdtTransaction(
  txid,
  userWallet,
  expectedAmount
) {
  try {
    // Get Treasury’s USDT ATA (Associated Token Account)
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(usdtMint),
      new PublicKey(TREASURY_WALLET),
      false
    );

    // Wait until transaction is confirmed & parsed
    const tx = await waitForParsedTransaction(txid, connection, 5);
    if (!tx) {
      return { status: false, message: 'Transaction not confirmed after retries' };
    }

    const instructions = tx.transaction.message.instructions;

    // Find USDT transfer instruction
    const tokenTransfer = instructions.find(i =>
      i.program === 'spl-token' &&
      i.parsed?.type === 'transfer' &&
      i.parsed.info?.authority === userWallet &&
      i.parsed.info?.destination === treasuryTokenAccount.toBase58()
    );

    if (!tokenTransfer) {
      return { status: false, message: 'No valid USDT transfer to treasury found' };
    }

    // Debug logs
    console.log("Type:", tokenTransfer.parsed?.type);
    console.log("Authority:", tokenTransfer.parsed?.info?.authority);
    console.log("Destination:", tokenTransfer.parsed?.info?.destination);

    // Extract amount
    const amountRaw = tokenTransfer.parsed.info.amount; // string
    const amount = Number(BigInt(amountRaw)) / 1e6; // USDT has 6 decimals

    if (amount < expectedAmount) {
      return {
        status: false,
        message: `Transferred ${amount} < expected ${expectedAmount}`
      };
    }

    return {
      status: true,
      message: 'USDT transaction verified',
      confirmedAmount: amount
    };

  } catch (error) {
    console.error('Error verifying USDT transaction:', error);
    return { status: false, message: 'Internal server error during verification' };
  }
}


// async function verifyUsdcTransaction(
//   txid,
//   userWallet,
//   expectedAmount
// ) {
//   try {
//     const treasuryTokenAccount = await getAssociatedTokenAddress(
//       new PublicKey(usdcMint),
//       new PublicKey(TREASURY_WALLET),
//       false
//     );

//     const tx = await waitForParsedTransaction(txid, connection, 5);
    
//     if (!tx) {
//       return { status: false, message: 'Transaction not confirmed after retries' };
//     }


//     const instructions = tx.transaction.message.instructions;

//     const tokenTransfer = instructions.find(i =>
//       i.program === 'spl-token' &&
//       i.parsed?.type === 'transfer' &&
//       i.parsed.info?.authority === userWallet &&
//       i.parsed.info?.destination === treasuryTokenAccount.toBase58()
//     );
// //  console.log(instructions)
//    console.log("Type:", tokenTransfer.parsed?.type);
//   console.log("Source:", tokenTransfer.parsed?.info?.authority);
//   console.log("Destination:", tokenTransfer.parsed?.info?.destination);
//     if (!tokenTransfer) {
//       return { status: false, message: ' No valid USDC transfer to treasury found' };
//     }


//     const amountRaw = tokenTransfer.parsed.info.amount;
//     const amount = parseFloat(amountRaw) / 1e6; // USDC = 6 decimals

//     if (amount < expectedAmount) {
//       return {
//         status: false,
//         message: ` Transferred amount ${amount} < expected ${expectedAmount}`
//       };
//     }

//     return {
//       status: true,
//       message: ' USDC transaction verified',
//       confirmedAmount: amount
//     };

//   } catch (error) {
//     console.error(' Error verifying USDC transaction:', error);
//     return { status: false, message: ' Internal server error during verification' };
//   }
// }


async function verifyUsdcTransaction(txid, userWallet, expectedAmount) {
  try {
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(usdcMint),
      new PublicKey(TREASURY_WALLET),
      false
    );

    const tx = await waitForParsedTransaction(txid, connection, 5);
    if (!tx) {
      return { status: false, message: 'Transaction not confirmed after retries' };
    }

    const instructions = tx.transaction.message.instructions;

    const tokenTransfer = instructions.find(i =>
      i.program === 'spl-token' &&
      i.parsed?.type === 'transfer' &&
      i.parsed.info?.authority === userWallet &&
      i.parsed.info?.destination === treasuryTokenAccount.toBase58()
    );

    if (!tokenTransfer) {
      return { status: false, message: 'No valid USDC transfer to treasury found' };
    }

    // Debug logs
    console.log("Type:", tokenTransfer.parsed?.type);
    console.log("Authority:", tokenTransfer.parsed?.info?.authority);
    console.log("Destination:", tokenTransfer.parsed?.info?.destination);

    // Safer amount handling
    const amountRaw = BigInt(tokenTransfer.parsed.info.amount); // raw integer
    const decimals = 1_000_000n; // 6 decimals
    const amount = Number(amountRaw) / Number(decimals); // Convert safely

    if (amount < expectedAmount) {
      return {
        status: false,
        message: `Transferred amount ${amount} < expected ${expectedAmount}`
      };
    }

    return {
      status: true,
      message: 'USDC transaction verified',
      confirmedAmount: amount
    };

  } catch (error) {
    console.error('Error verifying USDC transaction:', error);
    return { status: false, message: 'Internal server error during verification' };
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

app.post("/storeUsdcRecievedAndTokenSold",async (req,res)=>{
    const { recievedUsdc, soldTokens ,txid
,senderAddress,
expectedAmount} = req.body;

console.log(req.body);

  if (typeof recievedUsdc !== 'number' || typeof soldTokens !== 'number') {
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


   let result=await verifyUsdcTransaction(txid, senderAddress, expectedAmount);

   console.log(result);


if(result.status){
    let record = await RecordSold.findOne();

    if (!record) {
      record = new RecordSold({ recievedUsdc, soldTokens });
    } else {
      record.recievedUsdc += recievedUsdc;
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

app.post("/storeUsdtRecievedAndTokenSold",async (req,res)=>{
    const { recievedUsdt, soldTokens ,txid
,senderAddress,
expectedAmount} = req.body;

console.log(req.body);

  if (typeof recievedUsdt !== 'number' || typeof soldTokens !== 'number') {
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


   let result=await verifyUsdtTransaction(txid, senderAddress, expectedAmount);

   console.log(result);


if(result.status){
    let record = await RecordSold.findOne();

    if (!record) {
      record = new RecordSold({ recievedUsdt, soldTokens });
    } else {
      record.recievedUsdt += recievedUsdt;
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
          recievedUsdc: 0,
          recievedUsdt: 0,
          soldTokens: 0
        }
      });
    }

    res.status(200).json({
      status: true,
      message: "Fetched sold tokens successfully.",
      data: {
        recievedSol: record.recievedSol,
        recievedUsdc: record.recievedUsdc,
        recievedUsdt: record.recievedUsdt,
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
app.post("/api/addPurchaseUsdc", async (req, res) => {
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


    const result = await verifyUsdcTransaction(txid, address, expectedAmount);
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
app.post("/api/addPurchaseUsdt", async (req, res) => {
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


    const result = await verifyUsdtTransaction(txid, address, expectedAmount);

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
