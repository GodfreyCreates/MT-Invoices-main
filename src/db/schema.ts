import { pgTable, text, timestamp, numeric, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth-schema';

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  verificationToken: uuid('verification_token').defaultRandom().notNull(),
  clientCompanyName: text('client_company_name').notNull(),
  clientEmail: text('client_email').notNull(),
  clientPhone: text('client_phone').notNull(),
  clientStreet: text('client_street').notNull(),
  clientHouseNumber: text('client_house_number').notNull(),
  clientCity: text('client_city').notNull(),
  clientPostalCode: text('client_postal_code').notNull(),
  invoiceNo: text('invoice_no').notNull(),
  issueDate: text('issue_date').notNull(),
  dueDate: text('due_date').notNull(),
  paymentTerms: text('payment_terms').notNull(),
  notes: text('notes'),
  authorizedSignature: text('authorized_signature').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('invoices_user_id_idx').on(table.userId),
  uniqueIndex('invoices_verification_token_idx').on(table.verificationToken),
]);

export const services = pgTable('services', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  date: text('date').notNull(),
  sender: text('sender').notNull(),
  receiver: text('receiver').notNull(),
  reference: text('reference').notNull(),
  service: text('service').notNull(),
  quantity: numeric('quantity').notNull(),
  unitPrice: numeric('unit_price').notNull(),
  discountPercent: numeric('discount_percent').notNull(),
  taxPercent: numeric('tax_percent').notNull(),
});

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  services: many(services),
  owner: one(user, {
    fields: [invoices.userId],
    references: [user.id],
  }),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  invoice: one(invoices, {
    fields: [services.invoiceId],
    references: [invoices.id],
  }),
}));

export * from './auth-schema';
