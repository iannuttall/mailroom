CREATE UNIQUE INDEX messages_provider_unique
  ON messages(inbox_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
