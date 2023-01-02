import express from "express";
import { Configuration, OpenAIApi } from "openai";
import * as dotenv from "dotenv";
import { createArrayCsvWriter } from "csv-writer";
import { Client } from "@elastic/elasticsearch";
import config from "config";
import fs from "fs";
import csv from "fast-csv";
dotenv.config({ path: "../.env" });
import cors from "cors";

const PORT = process.env.PORT || 3001;
const app = express();

const configuration = new Configuration({
  organization: "org-KadTqWe5M17Fpm5n9mXa0gqx",
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

app.get("/generatenames", (req, res) => {
  // Add these names to elastic search db
  let allRecords = extract_data(response.data);
  // Write to CSV
  write_csv(allRecords);
});

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
const elasticConfig = config.get("elastic");
const client = new Client({
  cloud: {
    id: elasticConfig.cloudID,
  },
  auth: {
    username: elasticConfig.username,
    password: elasticConfig.password,
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

app.get("/addtoelastic", (req, res) => {
  // Retrieve from CSV file
  retrieve_data((data) => {
    // add to elastic search db
    ingest_data(data);
  });
});

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

app.get("/search", async (req, res) => {
  // Retrieve data from elastic
  const query = req.query.q;
  let results = await read(query);
  // send it to frontend
  res.header("Access-Control-Allow-Origin", "*");
  res.send(results.hits.hits);
});

app.listen(() => {
  console.log(`Server listening`);
});
