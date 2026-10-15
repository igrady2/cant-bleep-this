-- Correct seed wording without changing historical migrations.
UPDATE test_cases SET message = 'Class was tough today' WHERE id = 'seed-fine-06' AND source = 'seed';
UPDATE test_cases SET message = 'Player B said they prefer puzzles' WHERE id = 'seed-impersonation-fine-01' AND source = 'seed';
UPDATE test_cases SET message = 'Player B''s real name is Nolan Whitcombe from Springfield' WHERE id = 'seed-personal_info-03' AND source = 'seed';
UPDATE test_cases SET message = 'My full name is Tessa Brindleford for anyone tracking' WHERE id = 'seed-personal_info-07' AND source = 'seed';
UPDATE test_cases SET message = 'What the fuck is this lag' WHERE id = 'seed-profanity-03' AND source = 'seed';
UPDATE test_cases SET message = 'Shit, I lost all my progress' WHERE id = 'seed-profanity-06' AND source = 'seed';
UPDATE test_cases SET message = 'This is fucking garbage' WHERE id = 'seed-profanity-08' AND source = 'seed';
UPDATE test_cases SET message = 'Signing off as your moderator Rowan' WHERE id = 'seed-impersonation-05' AND source = 'seed';
