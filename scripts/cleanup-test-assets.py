import boto3

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)


def cleanup():
    print("Scanning for test data (IsTestData=true)...")
    count = 0
    scan_kwargs = {
        "FilterExpression": "IsTestData = :val",
        "ExpressionAttributeValues": {":val": True},
        "ProjectionExpression": "PK, SK",
    }

    with table.batch_writer() as batch:
        while True:
            response = table.scan(**scan_kwargs)
            items = response.get("Items", [])
            for item in items:
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                count += 1
                if count % 100 == 0:
                    print(f"  {count} deleted...")
            if "LastEvaluatedKey" not in response:
                break
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    print(f"Done. {count} test records deleted.")


if __name__ == "__main__":
    cleanup()
