import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InvoiceData } from '../store/useInvoiceStore';
import { Button } from '../components/ui/Button';
import { FileText, Users, DollarSign } from 'lucide-react';
import { AppHeader } from '../components/layout/AppHeader';
import { format } from 'date-fns';
import { apiRequest } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { useWorkspace } from '../lib/workspace';
import { toast } from 'sonner';

export function Dashboard() {
  const [invoices, setInvoices] = useState<(InvoiceData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { activeCompany } = useWorkspace();

  useEffect(() => {
    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const data = await apiRequest<(InvoiceData & { id: string })[]>('/api/invoices');
        setInvoices(data);
      } catch (error) {
        console.error('Error fetching invoices:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    if (!activeCompany) {
      setInvoices([]);
      setIsLoading(false);
      return;
    }

    void fetchInvoices();
  }, [activeCompany?.id]);

  const calculateInvoiceTotal = (invoice: InvoiceData) => {
    return invoice.services.reduce((acc, service) => {
      const quantity = Number(service.quantity) || 0;
      const unitPrice = Number(service.unitPrice) || 0;
      const discountPercent = Number(service.discountPercent) || 0;
      const taxPercent = Number(service.taxPercent) || 0;

      const subtotal = quantity * unitPrice;
      const discountAmount = subtotal * (discountPercent / 100);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = afterDiscount * (taxPercent / 100);
      return acc + afterDiscount + taxAmount;
    }, 0);
  };

  const totalRevenue = invoices.reduce((sum, inv) => sum + calculateInvoiceTotal(inv), 0);
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()).slice(0, 5);
  const uniqueClients = new Set(invoices.map(inv => inv.clientCompanyName)).size;

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24 sm:pb-0">
      <AppHeader />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {activeCompany ? activeCompany.name : 'Workspace overview'}
          </h1>
          <p className="text-gray-500 mt-1">
            Here&apos;s an overview of the invoicing activity in your active company workspace.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Revenue</p>
              <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</h3>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Invoices</p>
              <h3 className="text-2xl font-bold text-gray-900">{invoices.length}</h3>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Unique Clients</p>
              <h3 className="text-2xl font-bold text-gray-900">{uniqueClients}</h3>
            </div>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Recent Invoices</h2>
            <Button variant="ghost" onClick={() => navigate('/invoices')} className="text-blue-600 hover:text-blue-700">
              View All
            </Button>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : recentInvoices.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <FileText className="w-8 h-8 text-gray-400 mb-3" />
              <p className="text-gray-500 mb-4">No invoices created yet.</p>
              <Button onClick={() => navigate('/invoices/new')}>Create First Invoice</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-medium text-gray-500">Invoice No</th>
                    <th className="px-6 py-4 font-medium text-gray-500">Client</th>
                    <th className="px-6 py-4 font-medium text-gray-500">Issue Date</th>
                    <th className="px-6 py-4 font-medium text-gray-500 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/invoice/${invoice.id}/preview`)}>
                      <td className="px-6 py-4 font-medium text-gray-900">{invoice.invoiceNo}</td>
                      <td className="px-6 py-4 text-gray-600">{invoice.clientCompanyName}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM dd, yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">
                        {formatCurrency(calculateInvoiceTotal(invoice))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
