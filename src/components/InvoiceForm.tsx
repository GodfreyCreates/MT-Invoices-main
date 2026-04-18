import React from 'react';
import { useInvoiceStore } from '../store/useInvoiceStore';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { DEFAULT_AUTHORIZED_SIGNATURE } from '../store/useInvoiceStore';

type InvoiceFormProps = {
  isPreviewVisible?: boolean;
};

export function InvoiceForm({ isPreviewVisible = true }: InvoiceFormProps) {
  const { data, updateField, addService, updateService, duplicateService, removeService } = useInvoiceStore();
  const isInlineServicesLayout = !isPreviewVisible;

  // When preview is hidden: single straight row using flex, each field shrinks proportionally.
  // When preview is visible: stacked multi-row grid layout.
  const serviceFieldClasses = isInlineServicesLayout
    ? {
        description: 'space-y-1 flex-[2_2_160px] min-w-0',
        date:         'space-y-1 flex-[1_1_110px] min-w-0',
        reference:    'space-y-1 flex-[1_1_110px] min-w-0',
        sender:       'space-y-1 flex-[1_1_120px] min-w-0',
        receiver:     'space-y-1 flex-[1_1_120px] min-w-0',
        quantity:     'space-y-1 flex-[0_0_70px] min-w-0',
        unitPrice:    'space-y-1 flex-[0_0_80px] min-w-0',
        discount:     'space-y-1 flex-[0_0_70px] min-w-0',
        tax:          'space-y-1 flex-[0_0_60px] min-w-0',
      }
    : {
        description: 'col-span-12 md:col-span-6 space-y-2',
        date: 'col-span-6 md:col-span-3 space-y-2',
        reference: 'col-span-6 md:col-span-3 space-y-2',
        sender: 'col-span-12 md:col-span-6 space-y-2',
        receiver: 'col-span-12 md:col-span-6 space-y-2',
        quantity: 'col-span-6 md:col-span-3 space-y-2',
        unitPrice: 'col-span-6 md:col-span-3 space-y-2',
        discount: 'col-span-6 md:col-span-3 space-y-2',
        tax: 'col-span-6 md:col-span-3 space-y-2',
      };

  return (
    <div className="space-y-6 pb-20">
      <Card>
        <CardHeader>
          <CardTitle>Client Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={data.clientCompanyName} onChange={(e) => updateField('clientCompanyName', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={data.clientEmail} onChange={(e) => updateField('clientEmail', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={data.clientPhone} onChange={(e) => updateField('clientPhone', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Invoice No</Label>
            <Input value={data.invoiceNo} onChange={(e) => updateField('invoiceNo', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Street Address</Label>
            <Input value={data.clientStreet} onChange={(e) => updateField('clientStreet', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>House/Apt Number</Label>
            <Input value={data.clientHouseNumber} onChange={(e) => updateField('clientHouseNumber', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={data.clientCity} onChange={(e) => updateField('clientCity', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Postal Code</Label>
            <Input value={data.clientPostalCode} onChange={(e) => updateField('clientPostalCode', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Issue Date</Label>
            <Input type="date" value={data.issueDate} onChange={(e) => updateField('issueDate', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" value={data.dueDate} onChange={(e) => updateField('dueDate', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Input value={data.paymentTerms} onChange={(e) => updateField('paymentTerms', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.services.map((service, index) => (
            <div
              key={service.id}
              className={`border border-gray-200 rounded-xl bg-gray-50/50 relative group transition-all hover:border-blue-300 hover:shadow-sm ${
                isInlineServicesLayout
                  ? 'flex items-end gap-2 px-3 py-2 overflow-x-auto'
                  : 'p-5 space-y-4'
              }`}
            >
              {isInlineServicesLayout ? (
                /* ── Inline (preview hidden): index badge + all fields in one row ── */
                <>
                  <span className="flex-shrink-0 self-start mt-1 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                    {index + 1}
                  </span>

                  <div className={serviceFieldClasses.description}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</Label>
                    <Input value={service.service} onChange={(e) => updateService(service.id, 'service', e.target.value)} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.date}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</Label>
                    <Input type="date" value={service.date} onChange={(e) => updateService(service.id, 'date', e.target.value)} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.reference}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Ref <span className="text-red-500">*</span></Label>
                    <Input required value={service.reference} onChange={(e) => updateService(service.id, 'reference', e.target.value)} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.sender}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Sender <span className="text-red-500">*</span></Label>
                    <Input required value={service.sender} onChange={(e) => updateService(service.id, 'sender', e.target.value)} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.receiver}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Receiver <span className="text-red-500">*</span></Label>
                    <Input required value={service.receiver} onChange={(e) => updateService(service.id, 'receiver', e.target.value)} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.quantity}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Qty</Label>
                    <Input type="number" min="1" value={service.quantity} onChange={(e) => updateService(service.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.unitPrice}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Price <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" step="0.01" required value={service.unitPrice} onChange={(e) => updateService(service.id, 'unitPrice', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.discount}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Disc%</Label>
                    <Input type="number" min="0" max="100" value={service.discountPercent} onChange={(e) => updateService(service.id, 'discountPercent', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white h-8 text-sm" />
                  </div>
                  <div className={serviceFieldClasses.tax}>
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Tax%</Label>
                    <Input type="number" min="0" max="100" value={service.taxPercent} onChange={(e) => updateService(service.id, 'taxPercent', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white h-8 text-sm" />
                  </div>

                  {/* Action buttons */}
                  <div className="flex-shrink-0 flex gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Duplicate" onClick={() => duplicateService(service.id)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8 w-8 p-0" title="Remove" onClick={() => removeService(service.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                /* ── Stacked (preview visible): original layout ── */
                <>
                  <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Service Item {index + 1}</h4>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => duplicateService(service.id)}>
                        <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                      </Button>
                      <Button variant="destructive" size="sm" className="h-8 px-3" onClick={() => removeService(service.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                    <div className={serviceFieldClasses.description}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Description</Label>
                      <Input value={service.service} onChange={(e) => updateService(service.id, 'service', e.target.value)} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.date}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</Label>
                      <Input type="date" value={service.date} onChange={(e) => updateService(service.id, 'date', e.target.value)} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.reference}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference <span className="text-red-500">*</span></Label>
                      <Input required value={service.reference} onChange={(e) => updateService(service.id, 'reference', e.target.value)} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.sender}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sender <span className="text-red-500">*</span></Label>
                      <Input required value={service.sender} onChange={(e) => updateService(service.id, 'sender', e.target.value)} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.receiver}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Receiver <span className="text-red-500">*</span></Label>
                      <Input required value={service.receiver} onChange={(e) => updateService(service.id, 'receiver', e.target.value)} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.quantity}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</Label>
                      <Input type="number" min="1" value={service.quantity} onChange={(e) => updateService(service.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.unitPrice}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price <span className="text-red-500">*</span></Label>
                      <Input type="number" min="0" step="0.01" required value={service.unitPrice} onChange={(e) => updateService(service.id, 'unitPrice', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.discount}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Discount (%)</Label>
                      <Input type="number" min="0" max="100" value={service.discountPercent} onChange={(e) => updateService(service.id, 'discountPercent', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                    </div>
                    <div className={serviceFieldClasses.tax}>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax (%)</Label>
                      <Input type="number" min="0" max="100" value={service.taxPercent} onChange={(e) => updateService(service.id, 'taxPercent', e.target.value === '' ? '' : Number(e.target.value))} className="bg-white" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          
          <div className="pt-2">
            <Button 
              onClick={addService} 
              variant="outline" 
              className="w-full gap-2 border-dashed border-2 py-6 text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-5 h-5" /> Add Service
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
              value={data.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Authorized Signature Name</Label>
            <Input
              value={data.authorizedSignature}
              placeholder={DEFAULT_AUTHORIZED_SIGNATURE}
              onChange={(e) => updateField('authorizedSignature', e.target.value)}
              className="font-signature h-14 rounded-xl border-dashed border-slate-300 bg-gradient-to-r from-white via-slate-50 to-slate-100 px-4 text-3xl tracking-[0.03em] text-slate-900 shadow-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
