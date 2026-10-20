ALTER TABLE public.borrow_transactions
  ADD COLUMN borrower_type text;

ALTER TABLE public.borrow_transactions
  ADD CONSTRAINT borrow_transactions_borrower_type_check
  CHECK (borrower_type IS NULL OR borrower_type IN ('ผู้ป่วย', 'ญาติของผู้ป่วย', 'อสม.', 'เจ้าหน้าที่'));

COMMENT ON COLUMN public.borrow_transactions.borrower_type IS
  'Borrower category selected when submitting a borrow request.';
