-- DREAMFOREN v120.37 독립 영업·문서관리
create table if not exists public.sales_documents(
  id uuid primary key default gen_random_uuid(),
  document_type text not null check(document_type in ('quote','statement')),
  document_no text not null unique,
  company_name text not null,
  recipient text default '', biz_no text default '', address text default '', title text default '',
  issue_date date not null default current_date, valid_until date,
  subtotal numeric not null default 0, tax_amount numeric not null default 0,
  discount_amount numeric not null default 0, total_amount numeric not null default 0,
  status text not null default 'draft' check(status in ('draft','issued','accepted','cancelled')),
  note text default '', created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sales_document_items(
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.sales_documents(id) on delete cascade,
  sort_order integer not null default 0, item_name text not null default '', specification text default '',
  quantity numeric not null default 0, unit_price numeric not null default 0,
  supply_amount numeric not null default 0, tax_amount numeric not null default 0, note text default ''
);
create table if not exists public.sales_price_list(
  id uuid primary key default gen_random_uuid(), item_name text not null unique,
  unit_price numeric not null default 0, note text default '', updated_at timestamptz not null default now()
);
create table if not exists public.sales_document_settings(
  setting_key text primary key, setting_value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create index if not exists sales_documents_type_date_idx on public.sales_documents(document_type,issue_date desc);
create index if not exists sales_document_items_doc_idx on public.sales_document_items(document_id,sort_order);
alter table public.sales_documents enable row level security;
alter table public.sales_document_items enable row level security;
alter table public.sales_price_list enable row level security;
alter table public.sales_document_settings enable row level security;
grant select,insert,update,delete on public.sales_documents,public.sales_document_items,public.sales_price_list,public.sales_document_settings to authenticated;
drop policy if exists "sales admin all" on public.sales_documents;
drop policy if exists "sales admin all" on public.sales_document_items;
drop policy if exists "sales admin all" on public.sales_price_list;
drop policy if exists "sales admin all" on public.sales_document_settings;
create policy "sales admin all" on public.sales_documents for all to authenticated using(public.dreampoen_is_admin()) with check(public.dreampoen_is_admin());
create policy "sales admin all" on public.sales_document_items for all to authenticated using(public.dreampoen_is_admin()) with check(public.dreampoen_is_admin());
create policy "sales admin all" on public.sales_price_list for all to authenticated using(public.dreampoen_is_admin()) with check(public.dreampoen_is_admin());
create policy "sales admin all" on public.sales_document_settings for all to authenticated using(public.dreampoen_is_admin()) with check(public.dreampoen_is_admin());
insert into public.sales_price_list(item_name,unit_price,note) values
('먼지',200000,'첨부 단가표 기준'),('암모니아',50000,'첨부 단가표 기준'),('일산화탄소',60000,'첨부 단가표 기준'),
('염화수소',90000,'첨부 단가표 기준'),('염소',120000,'첨부 단가표 기준'),('황산화물',60000,'첨부 단가표 기준'),
('질소산화물',60000,'첨부 단가표 기준'),('이황화탄소',100000,'첨부 단가표 기준'),('황화수소',100000,'첨부 단가표 기준'),
('플루오린화합물',150000,'첨부 단가표 기준'),('사이안화수소',70000,'첨부 단가표 기준'),('매연',35000,'첨부 단가표 기준'),
('페놀화합물',50000,'첨부 단가표 기준'),('브로민화합물',120000,'첨부 단가표 기준'),('총탄화수소',70000,'첨부 단가표 기준'),
('비소화합물',300000,'첨부 단가표 기준'),('카드뮴화합물',110000,'첨부 단가표 기준'),('납화합물',110000,'첨부 단가표 기준'),
('크로뮴화합물',110000,'첨부 단가표 기준'),('구리화합물',110000,'첨부 단가표 기준'),('니켈화합물',110000,'첨부 단가표 기준'),
('아연화합물',110000,'첨부 단가표 기준'),('폼알데하이드',100000,'첨부 단가표 기준'),('아세트알데하이드',100000,'첨부 단가표 기준'),
('베릴륨',240000,'첨부 단가표 기준'),('수은',300000,'첨부 단가표 기준'),('출장비',150000,'안양 근교 1일 기준')
on conflict(item_name) do nothing;
insert into public.sales_document_settings(setting_key,setting_value) values('supplier','{"supplier_name":"주식회사 드림포이엔","supplier_biz_no":"529-88-02491","supplier_representative":"하준명","supplier_phone":"031-420-2156 ~ 8","supplier_fax":"031-420-2155","supplier_address":"경기도 안양시 만안구 덕천로152번길 25, B동 2005호","manager_text":"하준명 대표(010.5657.1251) naynay2@naver.com"}'::jsonb) on conflict(setting_key) do nothing;
notify pgrst,'reload schema';
