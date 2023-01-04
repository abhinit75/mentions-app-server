import { Configuration, OpenAIApi } from "openai";
import { createArrayCsvWriter } from "csv-writer";
import { Client } from "@elastic/elasticsearch";
import * as dotenv from "dotenv";
import express from "express";
import csv from "fast-csv";
import cors from "cors";
import fs from "fs";

// Initial Configuration
dotenv.config({ path: "../.env" });
const PORT = process.env.PORT || 3001;
const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://mentions-app-client.onrender.com",
      "https://mentions-app-server.onrender.com",
    ], // use your actual domain name (or localhost), using * is not recommended
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Origin",
      "X-Requested-With",
      "Accept",
      "x-client-key",
      "x-client-token",
      "x-client-secret",
      "Authorization",
    ],
    credentials: true,
  })
);

const configuration = new Configuration({
  organization: process.env.ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const response = await openai.createCompletion({
  model: "text-davinci-003",
  prompt: `Generate 25 names and 25 corresponding email addresses only with a domain and label 13 of them "Customer" and 12 of them "Employee". Provide this in the exact non-numbered format: Name-Email-Label`,
  temperature: 0.7,
  max_tokens: 1024,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
});

const extract_data = (data) => {
  // Extract text output
  let text = data.choices[0].text.trim();

  // Split by newline
  let list = text.split("\n");
  let allRecords = [];

  // For each line, seprate by type, name and email
  for (let i = 0; i < list.length; i++) {
    // Split again based on -
    let cust_details = list[i].split("-");
    allRecords.push(cust_details);
  }

  return allRecords;
};

const write_csv = (allRecords) => {
  // Format with labels
  const createCsvWriter = createArrayCsvWriter;
  const csvWriter = createCsvWriter({
    header: ["NAME", "EMAIL", "TYPE"],
    path: "./list.csv",
  });

  // Write to csv file
  csvWriter
    .writeRecords(allRecords) // returns a promise
    .then(() => {
      console.log("...Done");
    });
};

const retrieve_data = (callback) => {
  let data = [];

  fs.createReadStream("./list.csv")
    .pipe(csv.parse({ headers: true }))
    .on("error", (error) => console.error(error))
    .on("data", (row) => data.push(row))
    .on("end", () => {
      callback(data);
    });
};

// Configuring Elastic
const client = new Client({
  cloud: {
    id: process.env.CLOUD_ID,
  },
  auth: {
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});

const run = async (entry) => {
  await client.index({
    index: "name-list",
    body: {
      name: entry.NAME,
      email: entry.EMAIL,
      type: entry.TYPE,
    },
  });
  await client.indices.refresh({ index: "name-list" });
};

const ingest_data = (data) => {
  // for each entry, ingests
  data.map((entry) => {
    run(entry).catch(console.log);
  });
};

const read = async (str) => {
  const results = await client.search({
    index: "name-list",
    body: {
      query: {
        wildcard: {
          name: "*" + str + "*",
        },
      },
    },
  });
  return results;
};

// API Requests

// get request will retrive data from Open AI and store in CSV
app.get("/generatenames", (req, res) => {
  // Add these names to elastic search db
  let allRecords = extract_data(response.data);
  // Write to CSV
  write_csv(allRecords);
});

// get request will add data from csv to elastic
app.get("/addtoelastic", (req, res) => {
  // Retrieve from CSV file
  retrieve_data((data) => {
    // add to elastic search db
    ingest_data(data);
  });
});

// retrieves the data from elastic depending on input from user
app.get("/search", async (req, res) => {
  // Retrieve data from elastic
  const query = req.query.q;
  let results = await read(query);
  // send it to frontend
  res.send(JSON.stringify(results.hits.hits));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
