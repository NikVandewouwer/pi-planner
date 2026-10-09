-- No sign-in for now: everyone who opens the app shares all trains.
-- Removes members, invites and sharing, opens `trains` to anonymous visitors, and deletes all
-- existing data (trains and the users who signed in) so the app starts empty.
--
-- To bring accounts back later, restore the policies and tables from 20261009000000_trains.sql.

drop trigger if exists trains_add_owner on public.trains;
drop function if exists public.trains_add_owner();
drop function if exists public.share_train(text, text);
drop function if exists public.claim_invites();
drop function if exists public.train_people(text);

drop policy if exists "members read" on public.trains;
drop policy if exists "signed-in users create" on public.trains;
drop policy if exists "members edit" on public.trains;
drop policy if exists "owners delete" on public.trains;

drop table if exists public.train_invites;
drop table if exists public.train_members;
drop function if exists public.is_train_member(text);
drop function if exists public.is_train_owner(text);

-- Anyone with the app's publishable key can read and change every train. Fine for test data;
-- don't store anything sensitive until sign-in is back.
create policy "anyone reads" on public.trains for select to anon, authenticated using (true);
create policy "anyone creates" on public.trains for insert to anon, authenticated with check (true);
create policy "anyone edits" on public.trains for update to anon, authenticated using (true) with check (true);
create policy "anyone deletes" on public.trains for delete to anon, authenticated using (true);

-- start from scratch
truncate public.trains;
delete from auth.users;
