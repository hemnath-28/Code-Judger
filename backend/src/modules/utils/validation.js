import { z } from 'zod';

const languageSchema = z.enum(['python', 'java', 'cpp']);

export const runSchema = z.object({
  body: z.object({
    problemId: z.string().optional(),
    language: languageSchema,
    code: z.string().min(1).max(100_000),
    input: z.string().max(100_000).default('')
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough()
});

export const runBatchSchema = z.object({
  body: z.object({
    problemId: z.string().min(1),
    language: languageSchema,
    code: z.string().min(1).max(100_000),
    customCases: z.array(
      z.object({
        input: z.string().max(100_000).default(''),
        // Optional: if provided the server compares output and returns passed: true/false
        expectedOutput: z.string().max(10_000).optional()
      })
    ).max(3).default([])
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough()
});

export const submitSchema = z.object({
  body: z.object({
    problemId: z.string().min(1),
    language: languageSchema,
    code: z.string().min(1).max(100_000)
  }),
  params: z.object({}).passthrough(),
  query: z.object({}).passthrough()
});

export const problemIdParamSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({
    problemId: z.string().min(1)
  }),
  query: z.object({}).passthrough()
});

export const submissionIdParamSchema = z.object({
  body: z.object({}).passthrough(),
  params: z.object({
    submissionId: z.string().min(1)
  }),
  query: z.object({}).passthrough()
});
