-- Allow users to read equipment details when they can already see a related borrow record.
-- The borrow_transactions SELECT policy still limits which facilities' rows are visible.
create policy "users read equipment for visible borrows"
on public.equipment
for select
to authenticated
using (
  exists (
    select 1
    from public.borrow_transactions b
    where b.equipment_id = equipment.id
  )
);
