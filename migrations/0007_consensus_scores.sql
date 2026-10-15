-- A score and its verdict commit or roll back together. The pending transition
-- is the idempotency guard; retries and concurrent consensus calls cannot award
-- a second point. Late verdicts count on their confirmation day in UTC.
CREATE TRIGGER messages_award_slip
AFTER UPDATE OF status ON messages
WHEN OLD.status = 'pending' AND NEW.status = 'slip'
  AND NEW.filter_outcome = 'passed'
BEGIN
  INSERT INTO scores (player_id, day, slips)
  VALUES (NEW.author_id, strftime('%Y-%m-%d', 'now'), 1)
  ON CONFLICT (player_id, day) DO UPDATE SET slips = slips + 1;
END;
