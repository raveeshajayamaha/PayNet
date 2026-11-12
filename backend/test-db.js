
require("dotenv").config();

const dns = require("node:dns");
const mongoose = require("mongoose");

// Use Google Public DNS for Node.js DNS queries
dns.setServers(["8.8.8.8", "8.8.4.4"]);

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Connected Successfully!");
    console.log("Database:", mongoose.connection.name);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Connection failed!");
    console.error("Error type:", error.name);

    // Don't expose database credentials
    console.error(
      "Error:",
      String(error.message).replace(
        /mongodb(\+srv)?:\/\/\S+/gi,
        "[REDACTED_URI]"
      )
    );

    process.exitCode = 1;
  }
}

testConnection();
