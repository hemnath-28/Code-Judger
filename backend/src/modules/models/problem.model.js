import mongoose from 'mongoose';
// Stater code for All Three Langauges
const starterCodeSchema = new mongoose.Schema(
  {
    python: { type: String, required: true },
    java:   { type: String, required: true },
    cpp:    { type: String, required: true }
  },
  { _id: false }
);

// Correct reference solution — used to auto-validate custom test cases
const referenceSolutionSchema = new mongoose.Schema(
  { python: { type: String } },
  { _id: false }
);
// It says information about input type and return Type
const parameterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true }
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    title:
     { type: String, required: true, trim: true }
     ,
    slug:
     { type: String, required: true, unique: true, index: true }
     ,
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      required: true
    },
    topic: [{ type: String, trim: true }],
    description: { type: String, required: true },
    constraints: [{ type: String }],
    starterCode:        { type: starterCodeSchema, required: true },
    referenceSolution:  { type: referenceSolutionSchema, default: {} },
    judgeMode: {
      type: String,
      enum: ['stdin', 'function'],
      default: 'stdin'
    },
    functionName: { type: String },
    parameters: [parameterSchema],
    returnType: { type: String },
    timeLimitMs: { type: Number, default: 5000, min: 100, max: 30000 },
    memoryLimitMb: { type: Number, default: 256, min: 64, max: 1024 },
    isPublished: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Problem = mongoose.model('Problem', problemSchema);
