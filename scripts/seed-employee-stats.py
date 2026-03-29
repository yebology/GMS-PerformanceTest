import boto3
import uuid
import argparse
from datetime import datetime, timezone, timedelta

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

ISSUE_STATUSES = ["TROUBLESHOOTING", "UNDER_REPAIR", "SEND_WARRANTY", "RESOLVED"]
SW_STATUSES = ["PENDING_REVIEW", "ESCALATED_TO_MANAGEMENT", "SOFTWARE_INSTALL_APPROVED"]


def seed(employee_id: str, asset_count: int):
    print(f"Seeding {asset_count} assets with issues & software requests for employee {employee_id}...")
    now = datetime.now(timezone.utc)
    items = []

    for i in range(asset_count):
        asset_id = str(uuid.uuid4())
        handover_id = str(uuid.uuid4())
        assignment_date = (now - timedelta(days=asset_count - i)).isoformat()

        # 1. Asset metadata (ASSIGNED to this employee)
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": "METADATA",
            "Brand": f"TestBrand-{i}",
            "Model": f"TestModel-{i}",
            "SerialNumber": f"EMP-TEST-SN-{i:06d}",
            "Category": "LAPTOP",
            "Status": "ASSIGNED",
            "CreatedAt": assignment_date,
            "EntityType": "ASSET",
            "StatusIndexPK": "STATUS#ASSIGNED",
            "StatusIndexSK": f"ASSET#{asset_id}",
            "SerialNumberIndexPK": f"SERIAL#EMP-TEST-SN-{i:06d}",
            "SerialNumberIndexSK": "METADATA",
            "EmployeeAssetIndexPK": f"EMPLOYEE#{employee_id}",
            "EmployeeAssetIndexSK": f"ASSET#{assignment_date}",
            "IsTestData": True,
        })

        # 2. Handover record (accepted)
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"HANDOVER#{handover_id}",
            "HandoverID": handover_id,
            "EmployeeID": employee_id,
            "EmployeeName": "Test Employee",
            "EmployeeEmail": "test@example.com",
            "AssignedByID": "admin-test-id",
            "AssignmentDate": assignment_date,
            "AcceptedAt": assignment_date,
            "EmployeeAssetIndexPK": f"EMPLOYEE#{employee_id}",
            "EmployeeAssetIndexSK": f"ASSET#{assignment_date}",
            "IsTestData": True,
        })

        # 3. Issue per asset
        issue_id = str(uuid.uuid4())
        issue_status = ISSUE_STATUSES[i % len(ISSUE_STATUSES)]
        issue_created = (now - timedelta(days=asset_count - i, hours=2)).isoformat()
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"ISSUE#{issue_id}",
            "IssueID": issue_id,
            "IssueDescription": f"Test issue {i}",
            "Category": "HARDWARE",
            "Status": issue_status,
            "ReportedBy": employee_id,
            "CreatedAt": issue_created,
            "IssueStatusIndexPK": f"ISSUE_STATUS#{issue_status}",
            "IssueStatusIndexSK": f"ISSUE#{issue_created}",
            "IssueEntityType": "ISSUE",
            "IsTestData": True,
        })

        # 4. Software request per asset
        sw_id = str(uuid.uuid4())
        sw_status = SW_STATUSES[i % len(SW_STATUSES)]
        sw_created = (now - timedelta(days=asset_count - i, hours=4)).isoformat()
        items.append({
            "PK": f"ASSET#{asset_id}",
            "SK": f"SOFTWARE#{sw_id}",
            "SoftwareRequestID": sw_id,
            "SoftwareName": f"TestSoftware-{i}",
            "Version": "1.0",
            "Vendor": "TestVendor",
            "Justification": "Volume testing",
            "LicenseType": "PERPETUAL",
            "LicenseValidityPeriod": "N/A",
            "DataAccessImpact": "NONE",
            "Status": sw_status,
            "RequestedBy": employee_id,
            "CreatedAt": sw_created,
            "SoftwareStatusIndexPK": f"SOFTWARE_STATUS#{sw_status}",
            "SoftwareStatusIndexSK": f"SOFTWARE#{sw_created}",
            "SoftwareEntityType": "SOFTWARE_REQUEST",
            "IsTestData": True,
        })

    # Batch write all items
    with table.batch_writer() as batch:
        for idx, item in enumerate(items):
            batch.put_item(Item=item)
            if (idx + 1) % 100 == 0:
                print(f"  {idx + 1}/{len(items)} written")

    print(f"Done. Created {asset_count} assets x 4 records = {len(items)} total records.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("employee_id", help="Cognito user ID (sub) of the employee")
    parser.add_argument("asset_count", type=int, help="Number of assets to assign")
    args = parser.parse_args()
    seed(args.employee_id, args.asset_count)
