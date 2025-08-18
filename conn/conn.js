const mongoose = require('mongoose');

mongoose.connect(process.env.Database_URL)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.error(err);
  });


