"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const prisma = new client_1.PrismaClient();
const runMap = new Map();
const tokenMap = new Map();
const submissionMap = new Map();
app.get("/", (req, res) => {
    res.send("Hello World!");
});
app.post("/webhook/run/create", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { submissionTokenArray: data } = req.body;
    const newRunId = (0, crypto_1.randomUUID)();
    runMap.set(newRunId, []);
    data.map((value) => {
        var _a;
        tokenMap.set(value.token, null);
        (_a = runMap.get(newRunId)) === null || _a === void 0 ? void 0 : _a.push(value.token);
    });
    res.status(200).json({ runId: newRunId });
}));
app.post("/webhook/run/check", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = req.body;
        const runId = data.runId;
        const tokenArray = runMap.get(runId);
        if (!tokenArray) {
            res.status(404).json({ error: "Run not found" });
            return;
        }
        let allCompleted = true;
        for (const token of tokenArray) {
            if (tokenMap.get(token) === null) {
                allCompleted = false;
                break;
            }
        }
        if (allCompleted) {
            // const results: TestCaseResult[] = tokenArray.map(async (token) => {
            //   const res = await axios.get(
            //     `${process.env.JUDGE0_URL}/submissions/${token}?base64_encoded=false`
            //   );
            //   const data = res.data;
            //   if (data.error) {
            //     return {
            //       result: data.error as string,
            //       status: "PENDING",
            //     };
            //   }
            //   if (data.status.description === "Accepted") {
            //     return {
            //       result: data.stdout as string,
            //       status: "ACCEPTED",
            //     };
            //   } else if (data.status.description === "Wrong Answer") {
            //     return {
            //       result: data.stdout as string,
            //       status: "REJECTED",
            //     };
            //   } else {
            //     return {
            //       result: data.stderr as string,
            //       status: "REJECTED",
            //       message: data.message as string,
            //     };
            //   }
            // });
            res.status(200).json({
                status: "COMPLETED",
                results: Array.from(tokenArray),
            });
        }
        else {
            res.status(200).json({ status: "PENDING" });
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
app.put("/webhook/run", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = req.body;
        const token = data.token;
        console.log(data);
        const result = data.status.description;
        tokenMap.set(token, result);
        res.status(200).send("OK");
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
app.post("/webhook/submission/check", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = req.body;
        const submissionId = data.submissionId;
        while (submissionMap.size > 0) {
            const token = Array.from(submissionMap.keys())[0];
            const status = submissionMap.get(token);
            yield prisma.tokenTestCase.update({
                where: {
                    tokenId: token,
                },
                data: {
                    status: status,
                },
            });
            submissionMap.delete(token);
        }
        const testCases = yield prisma.tokenTestCase.findMany({
            where: {
                submissionId: submissionId,
            },
        });
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
                    yield prisma.submission.update({
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
                yield prisma.submission.update({
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
        }
        else {
            res.status(200).json({ status: "PENDING" });
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
app.put("/webhook/submission", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = req.body;
        const token = data.token;
        console.log(data);
        if (token === undefined) {
            res.status(400).send("Token is required");
            return;
        }
        const status = getStatusFromDescription(data.status.description);
        submissionMap.set(token, status);
        res.status(200).send("OK");
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}));
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
const getStatusFromDescription = (description) => {
    if (description === "Accepted") {
        return "ACCEPTED";
    }
    else if (description === "Wrong Answer") {
        return "WRONG_ANSWER";
    }
    else if (description.startsWith("Time Limit Exceeded")) {
        return "TIME_LIMIT_EXCEEDED";
    }
    else if (description.startsWith("Memory Limit Exceeded")) {
        return "MEMORY_LIMIT_EXCEEDED";
    }
    else if (description.startsWith("Runtime Error")) {
        return "RUNTIME_ERROR";
    }
    else if (description.startsWith("Compilation Error")) {
        return "COMPILATION_ERROR";
    }
    return "RUNTIME_ERROR";
};
exports.default = app;
