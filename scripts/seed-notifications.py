import boto3
import uuid
import argparse
from datetime import datetime, timezone, timedelta

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

NOTIFICATION_TYPES = [
    "NEW_ISSUE_REPORTED",
    "ASSET_APPROVED",
    "HANDOVER_ACCEPTED",
    "NEW_SOFTWARE_INSTALL_REQUEST",
    "REPLACEMENT_APPROVED",
]

REFERENCE_TYPES = ["ASSET", "ISSUE", "SOFTWARE", "DISPOSAL", "RETURN"]


def generate_notification(user_id: str, index: int) -> dict:
    notification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc) - timedelta(hours=index)
    timestamp = now.isoformat()
    expires_at = int((now + timedelta(days=90)).timestamp())
    notif_type = NOTIFICATION_TYPES[index % len(NOTIFICATION_TYPES)]
    ref_type = REFERENCE_TYPES[index % len(REFERENCE_TYPES)]

    return {
        "PK": f"USER#{user_id}",
        "SK": f"NOTIFICATION#{timestamp}#{notification_id}",
        "NotificationType": notif_type,
        "Title": f"Test Notification {index}",
        "Message": f"This is test notification number {index} for volume testing.",
        "ReferenceID": str(uuid.uuid4()),
        "ReferenceType": ref_type,
        "IsRead": index % 3 == 0,  # ~33% read, ~67% unread
        "CreatedAt": timestamp,
        "ExpiresAt": expires_at,
        "TTL": expires_at,
        "EntityType": "NOTIFICATION",
        "IsTestData": True,
    }


def seed(user_id: str, count: int):
    print(f"Seeding {count} test notifications for user {user_id}...")
    with table.batch_writer() as batch:
        for i in range(count):
            item = generate_notification(user_id, i)
            batch.put_item(Item=item)
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{count} seeded")
    print(f"Done. {count} test notifications seeded for user {user_id}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("user_id", help="Cognito user ID (sub) to seed notifications for")
    parser.add_argument("count", type=int, help="Number of notifications to seed")
    args = parser.parse_args()
    seed(args.user_id, args.count)
