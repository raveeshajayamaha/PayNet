const mongoose = require('mongoose');
const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const Notification = require('./Notification');
const Session = require('./Session');

function getModels(connection = mongoose.connection) {
  return Object.fromEntries([User, Wallet, Transaction, Notification, Session].map((model) => [
    model.modelName,
    connection.models[model.modelName] || connection.model(model.modelName, model.schema),
  ]));
}

module.exports = { User, Wallet, Transaction, Notification, Session, getModels };
