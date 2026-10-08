ALTER TABLE public.borrow_transactions
  ADD COLUMN borrower_address text,
  ADD COLUMN borrower_latitude numeric(9,6),
  ADD COLUMN borrower_longitude numeric(9,6),
  ADD CONSTRAINT borrow_borrower_coordinates_pair_check
    CHECK ((borrower_latitude IS NULL) = (borrower_longitude IS NULL)),
  ADD CONSTRAINT borrow_borrower_latitude_range_check
    CHECK (borrower_latitude IS NULL OR borrower_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT borrow_borrower_longitude_range_check
    CHECK (borrower_longitude IS NULL OR borrower_longitude BETWEEN -180 AND 180);

COMMENT ON COLUMN public.borrow_transactions.borrower_address IS
  'Address supplied by the borrower for this request.';
COMMENT ON COLUMN public.borrow_transactions.borrower_latitude IS
  'Latitude captured only after the borrower explicitly requests browser geolocation.';
COMMENT ON COLUMN public.borrow_transactions.borrower_longitude IS
  'Longitude captured only after the borrower explicitly requests browser geolocation.';
