/**
 * S-13 — Bank Reconciliation Upload (Phase D stub).
 */
import { BottomNav } from '../components/BottomNav';

export function ReconUpload() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold">Bank Reconciliation</h1>
        <p className="text-xs text-primary-200 mt-0.5">Upload HDFC statement</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-3">🏦</div>
        <h2 className="text-base font-semibold text-gray-700 mb-2">Coming in Phase D</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Upload your HDFC bank statement (.xlsx) to reconcile bank transactions with
          recorded income and expenses.
        </p>
      </div>

      <div className="h-20" />
      <BottomNav />
    </div>
  );
}
