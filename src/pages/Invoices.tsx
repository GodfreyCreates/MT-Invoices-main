import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoiceStore, InvoiceData } from '../store/useInvoiceStore';
import { Button } from '../components/ui/Button';
import { Edit, Trash2, Download, FileText, Eye, Search } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest } from '../lib/api';
import { downloadInvoicePdf, downloadInvoicesPdf } from '../lib/invoice-pdf';
import { useWorkspace } from '../lib/workspace';

export function Invoices() {
  const [invoices, setInvoices] = useState<(InvoiceData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; count: number; onConfirm: () => void }>({ isOpen: false, count: 0, onConfirm: () => {} });
  const navigate = useNavigate();
  const setInvoiceData = useInvoiceStore((state) => state.setInvoiceData);
  const { activeCompany } = useWorkspace();

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest<(InvoiceData & { id: string })[]>('/api/invoices');
      setInvoices(data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!activeCompany) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    void fetchInvoices();
  }, [activeCompany?.id]);

  const filteredInvoices = invoices.filter(invoice => {
    const query = searchQuery.toLowerCase();
    return (
      (invoice.invoiceNo || '').toLowerCase().includes(query) ||
      (invoice.clientCompanyName || '').toLowerCase().includes(query) ||
      (invoice.issueDate || '').toLowerCase().includes(query)
    );
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredInvoices.map(inv => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    setDeleteConfirm({
      isOpen: true,
      count: selectedIds.length,
      onConfirm: async () => {
        const results = await Promise.allSettled(
          selectedIds.map((id) => apiRequest<void>(`/api/invoices/${id}`, { method: 'DELETE' })),
        );
        const failedCount = results.filter((result) => result.status === 'rejected').length;

        if (failedCount === 0) {
          setInvoices(invoices.filter(inv => !selectedIds.includes(inv.id)));
          setSelectedIds([]);
          toast.success(`${selectedIds.length} invoices deleted`);
          return;
        }

        console.error('Error deleting invoices:', results);
        await fetchInvoices();
        setSelectedIds([]);
        toast.error(`${failedCount} invoice ${failedCount === 1 ? 'was' : 'were'} not deleted`);
      }
    });
  };

  const handleBulkDownload = async () => {
    setIsBulkDownloading(true);
    toast.info(`Preparing ${selectedIds.length} invoices for download...`);
    setDownloadingIds(selectedIds);

    try {
      const selectedInvoices = invoices.filter((invoice) => selectedIds.includes(invoice.id));
      await downloadInvoicesPdf(
        selectedInvoices,
        `Bulk_Invoices_${format(new Date(), 'yyyyMMdd')}.pdf`,
      );
      toast.success('Bulk download complete');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download invoices');
    } finally {
      setDownloadingIds([]);
      setIsBulkDownloading(false);
    }
  };

  const handleEdit = (invoice: InvoiceData & { id: string }) => {
    setInvoiceData(invoice);
    navigate('/invoices/new');
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({
      isOpen: true,
      count: 1,
      onConfirm: async () => {
        try {
          await apiRequest<void>(`/api/invoices/${id}`, {
            method: 'DELETE',
          });
          setInvoices(invoices.filter((inv) => inv.id !== id));
          toast.success('Invoice deleted successfully');
        } catch (error) {
          console.error('Error deleting invoice:', error);
          toast.error('Failed to delete invoice');
        }
      }
    });
  };

  const handleDownload = async (invoice: InvoiceData & { id: string }) => {
    setDownloadingIds([invoice.id]);
    toast.info('Preparing download...');

    try {
      await downloadInvoicePdf(invoice, `Invoice_${invoice.invoiceNo}.pdf`);
      toast.success('Invoice downloaded successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download invoice');
    } finally {
      setDownloadingIds([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24 sm:pb-0">
      <AppHeader />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Invoices</h1>
            <p className="mt-2 text-sm text-gray-500 sm:text-base">
              Search, review, download, and manage every invoice in {activeCompany?.name ?? 'your active company'}.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:max-w-3xl xl:flex-row xl:items-center xl:justify-end">
            <div className="relative w-full xl:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by invoice number, client, or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {selectedIds.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
                <span className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600">
                  {selectedIds.length} selected
                </span>
                <Button
                  variant="outline"
                  onClick={handleBulkDownload}
                  disabled={isBulkDownloading}
                  className="gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                >
                  <Download className="w-4 h-4" />
                  {isBulkDownloading ? 'Downloading...' : 'Download Selected'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkDelete}
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Trash2 className="w-4 h-4" /> Delete Selected
                </Button>
              </div>
            ) : (
              <p className="hidden text-sm text-gray-500 xl:block">
                Select invoices to download or delete them in bulk.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
              <p className="text-gray-500 mb-6">Create your first invoice to get started.</p>
              <Button onClick={() => navigate('/invoices/new')}>Create Invoice</Button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500">No invoices match your search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 w-12">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={filteredInvoices.length > 0 && selectedIds.length === filteredInvoices.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 font-medium text-gray-500">Invoice No</th>
                    <th className="px-6 py-4 font-medium text-gray-500">Client</th>
                    <th className="px-6 py-4 font-medium text-gray-500">Issue Date</th>
                    <th className="px-6 py-4 font-medium text-gray-500">Due Date</th>
                    <th className="px-6 py-4 font-medium text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <AnimatePresence>
                    {filteredInvoices.map((invoice) => (
                      <motion.tr 
                        key={invoice.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(invoice.id) ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedIds.includes(invoice.id)}
                            onChange={() => handleSelect(invoice.id)}
                          />
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{invoice.invoiceNo}</td>
                        <td className="px-6 py-4 text-gray-600">{invoice.clientCompanyName}</td>
                        <td className="px-6 py-4 text-gray-600">
                          {invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM dd, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => navigate(`/invoice/${invoice.id}/preview`)}
                              className="p-2 h-auto text-gray-600 hover:text-indigo-600"
                              title="View Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDownload(invoice)}
                              disabled={downloadingIds.includes(invoice.id)}
                              className="p-2 h-auto text-gray-600 hover:text-blue-600"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleEdit(invoice)}
                              className="p-2 h-auto text-gray-600 hover:text-emerald-600"
                              title="Edit Invoice"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDelete(invoice.id)}
                              className="p-2 h-auto text-gray-600 hover:text-red-600 hover:bg-red-50 border-transparent hover:border-red-200"
                              title="Delete Invoice"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative z-10"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Deletion</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete {deleteConfirm.count} {deleteConfirm.count === 1 ? 'invoice' : 'invoices'}? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
                >
                  Cancel
                </Button>
                <Button 
                  className="bg-red-600 hover:bg-red-700 text-white border-transparent" 
                  onClick={() => {
                    deleteConfirm.onConfirm();
                    setDeleteConfirm({ ...deleteConfirm, isOpen: false });
                  }}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
