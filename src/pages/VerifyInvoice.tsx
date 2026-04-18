import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, ShieldCheck, FileText, Building2, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { ApiError, apiRequest } from '../lib/api';

interface VerificationResult {
  verified: true;
  invoiceNo: string;
  clientCompanyName: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  verificationId: string;
}

export function VerifyInvoice() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isVerifying, setIsVerifying] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyInvoice = async () => {
      if (!token) {
        setError('Missing verification token');
        setIsVerifying(false);
        return;
      }

      try {
        const data = await apiRequest<VerificationResult>(`/api/verify-invoice/${token}`);
        setResult(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError('This invoice could not be verified');
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Verification failed');
        }
      } finally {
        setIsVerifying(false);
      }
    };

    void verifyInvoice();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
      >
        <div className="bg-indigo-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              <polygon fill="white" points="0,100 100,0 100,100" />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col items-center">
            {isVerifying ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-20 h-20 border-4 border-indigo-400 border-t-white rounded-full mb-4"
              />
            ) : (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
              >
                {result ? (
                  <ShieldCheck className="w-24 h-24 text-emerald-400 mb-4" />
                ) : (
                  <FileText className="w-24 h-24 text-red-300 mb-4" />
                )}
              </motion.div>
            )}

            <h1 className="text-2xl font-bold text-white mb-1">
              {isVerifying ? 'Verifying Document...' : result ? 'Verified Authentic' : 'Verification Failed'}
            </h1>
            <p className="text-indigo-200 text-sm">
              {isVerifying
                ? 'Checking secure verification token'
                : result
                  ? 'This invoice matches a saved record in the system.'
                  : error || 'We could not confirm this invoice.'}
            </p>
          </div>
        </div>

        {!isVerifying && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="p-8 space-y-6"
          >
            <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <FileText className="w-6 h-6 text-indigo-600 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice Number</p>
                <p className="text-lg font-bold text-gray-900">{result.invoiceNo}</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <Building2 className="w-6 h-6 text-indigo-600 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued To</p>
                <p className="text-lg font-bold text-gray-900">{result.clientCompanyName}</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <Calendar className="w-6 h-6 text-indigo-600 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Issue Date</p>
                <p className="text-lg font-bold text-gray-900">{result.issueDate}</p>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Verification token matched</span>
            </div>
          </motion.div>
        )}

        {!isVerifying && !result && (
          <div className="p-8 text-center text-sm text-gray-500">
            {error || 'This invoice is not recognized by the verification service.'}
          </div>
        )}

        <div className="bg-gray-50 p-4 text-center text-xs text-gray-400 border-t border-gray-100">
          Verification ID: {result?.verificationId ?? 'Unavailable'}
        </div>
      </motion.div>
    </div>
  );
}
