# Course and enrollment timelines

This is a local-storage demo, with no backend. Admin course settings are saved under `enzoAcademy-admin-courses-v1`; account enrollments remain under `enzoAcademy-learning-v2:<account id>`.

- Add/Edit Course supports a positive whole-number duration in days, weeks, or months, optional enrollment start/end times, and Active/Inactive availability.
- Admin times use the device timezone and are saved as ISO timestamps. Enrollment opens at the start and closes at the exact end. Blank bounds are unlimited.
- Days are 24 hours and weeks are seven days. Months advance the UTC calendar month, retaining the time and clamping the day to the destination month's final day.
- Each enrollment saves `enrolledAt` and `expiresAt`. Editing a course's duration applies to future enrollments only. Closing/inactivating a course does not shorten existing access.
- An unfinished enrollment expires at `expiresAt`. Completion before that instant remains Completed and permits review. A cancelled record is blocked. The existing admin removal action still deletes an enrollment; no extension/re-enrollment workflow was added.
- Legacy courses retain their level-based 4/8/12-week defaults until edited. Legacy closing dates include the entire date. Legacy enrollment dates are interpreted at local midnight and converted to timestamped records. Legacy completed records have no historical completion time, so their Completed status is preserved.
- Statuses are calculated from the clock, reconciled on load/focus and every second while open, and checked again on enrollment, lesson access, and submission. Stored account statuses are reconciled when read. No background process runs while the page is closed.

Run date-rule regression tests with:

```sh
npm test --workspace @enzo/domain
```

A deployed platform would need equivalent server-side checks and trusted server time; local browser data and its clock are user-controlled.
