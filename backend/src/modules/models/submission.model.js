import mongoose from 'mongoose';
// It Stores the User Code Submission Details for the Users to Debugging
const submissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
      index: true
    },
    language: {
      type: String,
      enum: ['python', 'java', 'cpp'],
      required: true
    },
    verdict: {
      type: String,
      enum: [
        'Accepted',
        'Wrong Answer',
        'Compilation Error',
        'Runtime Error',
        'Time Limit Exceeded'
      ],
      required: true
    },
    passed: { type: Number, required: true },
    total: { type: Number, required: true },
    runtimeMs: { type: Number, required: true },
    code: { type: String, required: true },
    failedTest: {
      input: { type: String, required: false },
      expectedOutput: { type: String, required: false },
      actualOutput: { type: String, required: false },
      error: { type: String, required: false }
    },
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);



submissionSchema.index({ userId: 1, submittedAt: -1 });
submissionSchema.index({ problemId: 1, submittedAt: -1 });

export const Submission = mongoose.model('Submission', submissionSchema);
