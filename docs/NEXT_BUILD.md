# Next build — one public page, end to end

Nothing here is new. Every mechanism below already exists and has been tested
on its own against production. This is assembly.

**Goal:** a stranger opens a link, types their name and a message, presses
Submit, and sees the count go up. The owner watches the row appear.

## Build it

1. **New Page.** It starts private; that is correct.
2. Insert, via `/` in the text strip at the top — click back into that strip
   between each one, since focus does not return there after an insert:
   - Input  (their name)
   - Input  (their message)
   - Button (Submit)
   - Database Table
   - Number Display (the count)
3. **Database columns.** Select the Database block, and in the Inspector rename
   the two columns to `Name` and `Message`, both type text. It ships with
   `Name` / `Age`.
4. **Wire Submit.** Drag from the Button's right port to the Database's left
   port. In the connection popup choose **Add Row**, and map:
   - `Name`    <- block -> the first Input
   - `Message` <- block -> the second Input
5. **Wire the count.** Drag from the Database's right port to the Number
   Display. The Database's output mode is already `row_count`.
6. **Press Publish**, copy the link.

## Prove it

Open the link in a private window — no account, exactly what a stranger gets.
Submit something. Then check, on the editor:

- the row appears in the table
- the count goes up
- the stranger cannot edit the page, delete a row, or see any other page
  (already verified at the database level, but confirm it through the UI)

Leave the editor open on a laptop and submit from a phone: the table should
grow within about four seconds without a refresh. That is the one piece of
recent work still unverified in a browser.

## Then, and only then

Send it to five people. Watch what confuses them. That list is the roadmap —
not anything written in advance, including this file.

## Known rough edges they will hit

These are already understood; do not rediscover them.

- After inserting a block you must click back into the top text strip before
  `/` works again.
- Block names in dropdowns read like `Button (7b41)`.
- Rows are scoped only by `database_block_id` — no collection model yet.
- Blocks sit at fixed x/y, so a published page does not reflow on a phone.
  Half your visitors will be on one. This is the layout decision in
  docs/DIRECTION.md, and it is the reason not to redesign anything yet.
