import mongoose from 'mongoose';
// Seprate Testcase Schema as we dont need everything required to Problem 
// if we embed it Document will be huge and we need to fetch lot of Unnecessary Information 
const testCaseSchema = new mongoose.Schema(
  {
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
      index: true
    },
    input: { type: String, required: true },
    expectedOutput: { type: String, default: '' },
    isHidden: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

testCaseSchema.index({ problemId: 1, order: 1 });

export const TestCase = mongoose.model('TestCase', testCaseSchema);
