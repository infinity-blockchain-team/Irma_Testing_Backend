const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const recordSoldSchema=new Schema({
    recievedSol:{
         type:Number,
        required:true
    },
    soldTokens:{
        type:Number,
        required:true,
        default:0
    }

})

const RecordSold=mongoose.model('RecordSold',recordSoldSchema);


const schema = new mongoose.Schema({
  tokenBought: { type: Number, required: true, default: 0 },
  address: { type: String, required: true }
});
TokenBoughtRecord = mongoose.model("TokenBoughtRecord", schema);



const transactionSchema = new mongoose.Schema({
  txid: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now }
});

TransactionRecord = mongoose.model('TransactionRecord', transactionSchema);

module.exports={ RecordSold,TokenBoughtRecord,TransactionRecord }
