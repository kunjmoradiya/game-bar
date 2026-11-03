CREATE TABLE IF NOT EXISTS user_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  request_title text NOT NULL,
  request_category text NOT NULL,
  request_description text NOT NULL,
  attachment_key text NOT NULL DEFAULT '',
  attachment_name text NOT NULL DEFAULT '',
  attachment_type text NOT NULL DEFAULT '',
  attachment_size bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  owner_response text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_requests_user_created_idx ON user_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_requests_status_created_idx ON user_requests(status, created_at DESC);
CREATE TABLE IF NOT EXISTS user_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES user_requests(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id text NOT NULL DEFAULT '',
  actor_name text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_request_events_request_idx ON user_request_events(request_id, created_at ASC);
CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_id uuid REFERENCES user_requests(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications(user_id, is_read, created_at DESC);