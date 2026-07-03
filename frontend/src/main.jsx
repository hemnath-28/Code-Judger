import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ProblemPage from './modules/coding/pages/ProblemPage.jsx';
import ProblemListPage from './modules/coding/pages/ProblemListPage.jsx';
import SubmissionHistoryPage from './modules/coding/pages/SubmissionHistoryPage.jsx';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <ProblemListPage /> },
  { path: '/problems/:problemId', element: <ProblemPage /> },
  { path: '/submissions', element: <SubmissionHistoryPage /> }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
