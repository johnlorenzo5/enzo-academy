# Guided learning

The Firebase-connected app supports Course → Module → ordered activities. The original `?demo=1` application remains a separate local prototype.

## Author a course

1. Sign in as the configured administrator. Open **Courses → Modules & quizzes**.
2. For a legacy module, choose **Build ordered activities**. This keeps its text as a reading and its quiz or practice as the following activity. Existing enrollments retain their original snapshots.
3. Add **video**, **reading**, **practice**, or **quiz** activities. Use **Move earlier / Move later** to set their order. Module reordering is also supported.
4. For a video, paste a YouTube watch URL, short link, Shorts URL, embed URL, or 11-character video ID. Use **Preview video** to check it. The video must be recorded, available, and embeddable; live streams are not supported. Supported duration is 1 second to 6 hours. The learner player supports speeds up to 2×.
5. Add an estimated duration, transcript text, and up to ten named HTTPS resource links. These are supplied by the administrator; transcripts are not generated or extracted from YouTube. File uploads are not part of this release.
6. For quizzes, use the existing answer editor and passing score. Save, then activate the course when it is ready for enrollment.

Drafts continue to save on the current device. Supported limits are 50 modules, 50 activities per module, and 100 activities in one course. Course content is capped at 450 KB to leave room for progress in Firestore enrollment documents. Split large courses when needed.

## Learner interface

**My learning → Continue learning** opens a dedicated page. The curriculum sidebar shows activity types, estimated durations, completion marks, grades, and locked future activities. On narrow screens it becomes a collapsible course-content drawer. Transcript, Notes, and Resources are available below the lesson; desktop also has shortcut buttons on the right.

The current activity is encoded in the URL, so refresh and browser navigation work. Learners can revisit completed activities while access permits. Personal notes save explicitly with **Save note**; each note supports 2,000 characters. Practice responses also support 2,000 characters.

## Completion and access

- **Video:** at least 95% estimated distinct playback coverage and playback reaching the end. Seeking past sections does not count, and replaying sections does not add duplicate credit. The player samples normal playback, pauses when the page becomes hidden, and saves periodically and on pause/end. Closing the tab abruptly can lose the last few unsaved seconds. Return to resume from the last saved position; **Replay from start** is available for missed sections.
- **Reading:** explicit **Mark as read** acknowledgment.
- **Practice:** submit at least ten characters of practice notes or a solution.
- **Quiz:** pass the configured score using server grading. Failed retries do not revoke previously earned completion.

An activity unlocks after all preceding activities are complete, including across module boundaries. Unlocking depends on the server response. Failed saves show an error and leave the next activity locked. The server strips locked content, transcripts, video IDs, resources, and questions from learner responses and rejects premature submissions, note updates, and video sessions.

The existing enrollment expiration/cancellation rules still apply. Timely completed courses retain their existing review access. Learners cannot grant themselves completion through a video “mark complete” request.

## Storage and compatibility

New activity progress is stored by permanent activity ID in `academyEnrollments.activityProgress`. `done` continues to track module-level completion for existing dashboards. Existing course snapshots and completed module credit are preserved, including legacy modules completed out of order. No live data migration or bulk rewrite is required.

Video coverage and the current session are stored separately in `academyVideoWatches`; nested ranges are objects for Firestore compatibility. Session tokens and coverage data are not included in learner enrollment responses. A new session supersedes an older tab's session for the same activity. Sequenced packets allow retries without double credit; coverage is bounded by server elapsed time at up to 2× playback speed.

These measures check plausible browser playback reports, not attention or tamper-proof viewing. Video duration and playback events originate in the browser. Use quizzes to assess understanding. Replacing a video's content at the same provider URL can affect old snapshots; publish a new activity/video for substantive changes and keep old media available to existing learners.

## Verification and local preview

Run `npm run check` for type checking, API/domain/UI tests, and production builds. Tests use in-memory stores and virtual DOMs, including a simulated YouTube player. They do not write to Firebase.

With `npm run dev` running, open `http://127.0.0.1:5173/test/learning-preview.html` for an isolated interface fixture. It contains a real embedded YouTube player and a course-builder preview, but its mocked API does not award video completion or access the live database. This test HTML is not a production build entry point.
