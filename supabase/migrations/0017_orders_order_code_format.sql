-- Reformats order_code with hyphen separators: YYYYMMDD-XXXXXX-0001
-- (previously a plain 18-char concatenation with no separators). Application
-- code in lib/order-code.ts now generates the hyphenated format for new rows;
-- this migration reformats existing rows to match, preserving their existing
-- date/random/sequence parts.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

update public.orders
set order_code = substr(order_code, 1, 8) || '-' || substr(order_code, 9, 6) || '-' || substr(order_code, 15, 4)
where order_code !~ '^[0-9]{8}-[A-Z0-9]{6}-[0-9]{4}$';
