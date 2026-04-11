-- Fix infinite recursion in RLS policies
-- Problem: companies policy checks company_users, company_users policy checks companies

-- Drop all existing policies
DROP POLICY IF EXISTS "Admin full access" ON companies;
DROP POLICY IF EXISTS "Client read own company" ON companies;
DROP POLICY IF EXISTS "Admin orders" ON orders;
DROP POLICY IF EXISTS "Client read orders" ON orders;
DROP POLICY IF EXISTS "Admin documents" ON documents;
DROP POLICY IF EXISTS "Client read documents" ON documents;
DROP POLICY IF EXISTS "Client upload documents" ON documents;
DROP POLICY IF EXISTS "Admin order_events" ON order_events;
DROP POLICY IF EXISTS "Client read order_events" ON order_events;
DROP POLICY IF EXISTS "Admin reorder_rules" ON reorder_rules;
DROP POLICY IF EXISTS "Admin manage company_users" ON company_users;
DROP POLICY IF EXISTS "User read own membership" ON company_users;

-- Helper function: get company IDs for current user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Companies the user owns
  SELECT id FROM companies WHERE owner_id = auth.uid()
  UNION
  -- Companies the user is a member of
  SELECT company_id FROM company_users WHERE user_id = auth.uid()
$$;

-- Helper: check if user is admin of a company
CREATE OR REPLACE FUNCTION is_company_admin(cid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM companies WHERE id = cid AND owner_id = auth.uid())
$$;

-- Companies: owner sees their companies, members see their companies
CREATE POLICY "User sees own companies" ON companies FOR SELECT
  USING (id IN (SELECT get_user_company_ids()));

CREATE POLICY "Admin manages companies" ON companies FOR ALL
  USING (owner_id = auth.uid());

-- Company users: no recursion, simple auth.uid() check
CREATE POLICY "User reads own memberships" ON company_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin manages members" ON company_users FOR ALL
  USING (is_company_admin(company_id));

-- Orders
CREATE POLICY "User reads own orders" ON orders FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));

CREATE POLICY "Admin manages orders" ON orders FOR ALL
  USING (is_company_admin(company_id));

-- Documents
CREATE POLICY "User reads own documents" ON documents FOR SELECT
  USING (company_id IN (SELECT get_user_company_ids()));

CREATE POLICY "User uploads documents" ON documents FOR INSERT
  WITH CHECK (company_id IN (SELECT get_user_company_ids()));

CREATE POLICY "Admin manages documents" ON documents FOR ALL
  USING (is_company_admin(company_id));

-- Order events
CREATE POLICY "User reads own events" ON order_events FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE company_id IN (SELECT get_user_company_ids())));

CREATE POLICY "Admin manages events" ON order_events FOR ALL
  USING (order_id IN (SELECT id FROM orders WHERE is_company_admin(company_id)));

-- Reorder rules (admin only)
CREATE POLICY "Admin manages reorder_rules" ON reorder_rules FOR ALL
  USING (is_company_admin(company_id));
