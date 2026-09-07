-- Add bio field to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio VARCHAR(200);
