import { pgTable, text, timestamp, numeric, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth-schema';
import { DEFAULT_INVOICE_THEME } from '../lib/invoice-themes';

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  poBox: text('po_box'),
  streetAddress: text('street_address').notNull(),
  standNumber: text('stand_number'),
  documentLogoUrl: text('document_logo_url'),
  documentLogoKey: text('document_logo_key'),
  bankName: text('bank_name').notNull(),
  accountHolder: text('account_holder').notNull(),
  accountNumber: text('account_number').notNull(),
  accountType: text('account_type').notNull(),
  branchCode: text('branch_code').notNull(),
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('companies_created_by_user_id_idx').on(table.createdByUserId),
]);

export const companyMemberships = pgTable('company_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('company_memberships_company_id_idx').on(table.companyId),
  index('company_memberships_user_id_idx').on(table.userId),
  uniqueIndex('company_memberships_company_user_idx').on(table.companyId, table.userId),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
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
  theme: text('theme').notNull().default(DEFAULT_INVOICE_THEME),
  notes: text('notes'),
  authorizedSignature: text('authorized_signature').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('invoices_user_id_idx').on(table.userId),
  index('invoices_company_id_idx').on(table.companyId),
  index('invoices_company_updated_at_idx').on(table.companyId, table.updatedAt, table.createdAt),
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

export const userInvitations = pgTable('user_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  role: text('role').notNull().default('user'),
  token: uuid('token').defaultRandom().notNull(),
  inviterUserId: text('inviter_user_id').references(() => user.id, { onDelete: 'set null' }),
  acceptedAt: timestamp('accepted_at'),
  revokedAt: timestamp('revoked_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('user_invitations_email_idx').on(table.email),
  index('user_invitations_inviter_user_id_idx').on(table.inviterUserId),
  uniqueIndex('user_invitations_token_idx').on(table.token),
]);

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  services: many(services),
  owner: one(user, {
    fields: [invoices.userId],
    references: [user.id],
  }),
  company: one(companies, {
    fields: [invoices.companyId],
    references: [companies.id],
  }),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  invoice: one(invoices, {
    fields: [services.invoiceId],
    references: [invoices.id],
  }),
}));

export const companiesRelations = relations(companies, ({ many, one }) => ({
  memberships: many(companyMemberships),
  invoices: many(invoices),
  createdBy: one(user, {
    fields: [companies.createdByUserId],
    references: [user.id],
  }),
}));

export const companyMembershipsRelations = relations(companyMemberships, ({ one }) => ({
  company: one(companies, {
    fields: [companyMemberships.companyId],
    references: [companies.id],
  }),
  user: one(user, {
    fields: [companyMemberships.userId],
    references: [user.id],
  }),
}));

export * from './auth-schema';
