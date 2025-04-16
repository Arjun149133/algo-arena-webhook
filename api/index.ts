import express from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import "dotenv/config";

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const app = express();

app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

// const submissionMap: Map<
//   string,
//   | "ACCEPTED"
//   | "WRONG_ANSWER"
//   | "TIME_LIMIT_EXCEEDED"
//   | "MEMORY_LIMIT_EXCEEDED"
//   | "RUNTIME_ERROR"
//   | "COMPILATION_ERROR"
// > = new Map();

app.get("/", (req, res) => {
  res.send("Hello World!!");
});

app.post("/webhook/run/check", async (req, res) => {
  try {
    const data = req.body;

    const submissionTokenArray: { token: string }[] = data.submissionTokenArray;

    let allCompleted = true;
    for (const token of submissionTokenArray) {
      console.log("error", token);
      const status = redis.get(token.token);

      if (status === undefined) {
        allCompleted = false;
        console.log("Token status is undefined");
        break;
      }

      if (status === null) {
        allCompleted = false;
        console.log("Token status is null");
        break;
      }
    }

    console.log("allcompleted", allCompleted);
    if (allCompleted) {
      res.status(200).json({
        status: "COMPLETED",
      });
    } else {
      res.status(200).json({ status: "PENDING" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/webhook/run", async (req, res) => {
  try {
    const data = req.body;

    const token = data.token;

    console.log(token, data.token, data.status);

    const result = data.status.description;

    await redis.set(token, result);

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/webhook/submission/check", async (req, res) => {
  try {
    const data = req.body;

    const submissionId: string = data.submissionId;

    const tokenTestCases = await prisma.tokenTestCase.findMany({
      where: {
        submissionId: submissionId,
      },
    });

    console.log("tokenTestCases", tokenTestCases);

    for (const tokenTestCase of tokenTestCases) {
      const status = await redis.get(tokenTestCase.tokenId);

      console.log("status", status);

      if (status !== null && status !== undefined) {
        await prisma.tokenTestCase.update({
          where: {
            tokenId: tokenTestCase.tokenId,
          },
          data: {
            status: status,
          },
        });
      }
    }

    const testCases = await prisma.tokenTestCase.findMany({
      where: {
        submissionId: submissionId,
      },
    });

    console.log("testCases", testCases);

    let allCompleted = true;

    for (const testCase of testCases) {
      if (testCase.status === "PENDING") {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted) {
      let accepted = true;
      for (const testCase of testCases) {
        if (testCase.status !== "ACCEPTED") {
          accepted = false;
          await prisma.submission.update({
            where: {
              id: submissionId,
            },
            data: {
              status: testCase.status,
            },
          });
          break;
        }
      }

      if (accepted) {
        await prisma.submission.update({
          where: {
            id: submissionId,
          },
          data: {
            status: "ACCEPTED",
          },
        });
      }

      res.status(200).json({
        status: "COMPLETED",
      });
    } else {
      res.status(200).json({ status: "PENDING" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/webhook/submission", async (req, res) => {
  try {
    const data = req.body;
    const token: string = data.token;

    console.log(token);
    console.log(data);

    if (token === undefined) {
      res.status(400).send("Token is required");
      return;
    }

    const status = getStatusFromDescription(data.status.description);

    await redis.set(token, status);

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000!");
});

const getStatusFromDescription = (description: string) => {
  if (description === "Accepted") {
    return "ACCEPTED";
  } else if (description === "Wrong Answer") {
    return "WRONG_ANSWER";
  } else if (description.startsWith("Time Limit Exceeded")) {
    return "TIME_LIMIT_EXCEEDED";
  } else if (description.startsWith("Memory Limit Exceeded")) {
    return "MEMORY_LIMIT_EXCEEDED";
  } else if (description.startsWith("Runtime Error")) {
    return "RUNTIME_ERROR";
  } else if (description.startsWith("Compilation Error")) {
    return "COMPILATION_ERROR";
  }
  return "RUNTIME_ERROR";
};

export default app;
