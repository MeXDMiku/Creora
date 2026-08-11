-- Creora — drop the temporary orphan-claiming door.
--
-- claim_orphan_pages() existed so the three pages created before ownership
-- were not stranded by the identity migration. They are all claimed now
-- (verified 11 Aug: 3 pages, 0 unowned, all owned by the email account), so
-- the function has done its job. While it exists, any caller holding the
-- public anon key inherits any page that has no owner.
drop function if exists public.claim_orphan_pages();
notify pgrst, 'reload schema';
