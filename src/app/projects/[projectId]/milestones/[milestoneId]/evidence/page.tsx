'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';

export default function SubmitEvidencePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [qtyOrPercent, setQtyOrPercent] = useState('100');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    loadData();
  }, [projectId, milestoneId]);

  const loadData = async () => {
    try {
      const [projectRes, milestoneRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/milestones/${milestoneId}`),
      ]);

      const [projectData, milestoneData] = await Promise.all([
        projectRes.json(),
        milestoneRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (milestoneData.success) {
        setMilestoneTitle(milestoneData.data.title);

        // Check if user can submit evidence
        if (milestoneData.data.state !== 'IN_PROGRESS') {
          setError('Evidence can only be submitted when milestone is In Progress');
        }
        if (!milestoneData.data.permissions.canSubmitEvidence) {
          setError('You do not have permission to submit evidence');
        }
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (files.length === 0) {
      setError('At least one file is required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('qtyOrPercent', qtyOrPercent);
      if (remarks) formData.append('remarks', remarks);
      files.forEach((file) => formData.append('files', file));

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}/evidence`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await res.json();

      if (data.success) {
        router.push(`/projects/${projectId}/milestones/${milestoneId}`);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to submit evidence');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Submit Evidence</h1>
        <p className="text-gray-600 mb-6">Milestone: {milestoneTitle}</p>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <div className="card">
          <form onSubmit={handleSubmit} className="card-body space-y-6">
            <div>
              <label className="label">Completion Percentage *</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                className="input"
                value={qtyOrPercent}
                onChange={(e) => setQtyOrPercent(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the percentage of work completed (0-100)
              </p>
            </div>

            <div>
              <label className="label">Remarks</label>
              <textarea
                className="input"
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes about the work completed..."
              />
            </div>

            <div>
              <label className="label">Evidence Files *</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  accept="image/*,.pdf,.doc,.docx"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-primary-600 hover:text-primary-700"
                >
                  Click to upload files
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Images, PDFs, or documents up to 10MB each
                </p>
              </div>

              {files.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between bg-gray-50 rounded p-2"
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Evidence will be frozen after submission and cannot be edited.
                Make sure all files are correct before submitting.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || files.length === 0}
                className="btn btn-primary"
              >
                {submitting ? 'Submitting...' : 'Submit Evidence'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
