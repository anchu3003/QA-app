import os
import json
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TAGS = [
    ("fsx_lustre", r"fsx for lustre"),
    ("fsx_windows", r"fsx for windows"),
    ("fsx_ontap", r"fsx for (netapp )?ontap"),
    ("fsx_openzfs", r"fsx for openzfs"),
    ("storage_gateway_tape", r"tape gateway|virtual tape library"),
    ("storage_gateway_volume", r"volume gateway"),
    ("storage_gateway_file", r"s3 file gateway|file gateway"),
    ("s3_glacier_deep_archive", r"glacier deep archive"),
    ("s3_glacier_instant_retrieval", r"glacier instant retrieval"),
    ("s3_glacier_flexible", r"glacier flexible retrieval"),
    ("s3_standard_ia", r"standard-ia|standard infrequent access"),
    ("s3_one_zone_ia", r"one zone-ia|one zone infrequent"),
    ("s3_intelligent_tiering", r"intelligent-tiering|intelligent tiering"),
    ("s3_object_lock", r"object lock"),
    ("s3_requester_pays", r"requester pays"),
    ("s3_transfer_acceleration", r"transfer acceleration"),
    ("s3_access_points", r"s3 access point"),
    ("s3_replication", r"cross-region replication|cross region replication|\bcrr\b"),
    ("s3_presigned_url", r"presigned url"),
    ("s3_lifecycle", r"lifecycle (policy|rule)"),
    ("s3_gateway_endpoint", r"gateway (vpc )?endpoint"),
    ("vpc_interface_endpoint", r"interface (vpc )?endpoint|privatelink"),
    ("cloudfront_lambda_edge", r"lambda@edge"),
    ("cloudfront_signed", r"signed url|signed cookie"),
    ("cloudfront_oac_oai", r"origin access (control|identity)"),
    ("cloudfront", r"cloudfront"),
    ("waf", r"aws waf"),
    ("shield_advanced", r"shield advanced"),
    ("firewall_manager", r"firewall manager"),
    ("guardduty", r"guardduty"),
    ("macie", r"\bmacie\b"),
    ("inspector", r"amazon inspector"),
    ("kms_multi_region", r"multi-region key"),
    ("kms_rotation", r"customer managed key|automatic key rotation|kms key rotation"),
    ("kms_general", r"aws kms|key management service"),
    ("secrets_manager", r"secrets manager"),
    ("parameter_store", r"parameter store"),
    ("cross_account_role", r"cross-account|assume.{0,15}role|trust polic"),
    ("iam_role_ec2", r"instance profile|iam role"),
    ("scp_organizations", r"service control polic|\bscp\b"),
    ("rds_multi_az", r"multi-az"),
    ("rds_read_replica", r"read replica"),
    ("rds_proxy", r"rds proxy"),
    ("aurora_serverless", r"aurora serverless"),
    ("aurora_global_database", r"aurora global database"),
    ("aurora_general", r"amazon aurora"),
    ("dynamodb_global_tables", r"global table"),
    ("dynamodb_dax", r"dynamodb accelerator|\bdax\b"),
    ("elasticache_redis", r"elasticache for redis"),
    ("elasticache_memcached", r"elasticache for memcached"),
    ("auto_scaling_scheduled", r"scheduled (scaling|action)"),
    ("auto_scaling_target_tracking", r"target tracking"),
    ("auto_scaling_warm_pool", r"warm pool"),
    ("ec2_spot", r"spot instance|spot fleet"),
    ("savings_plan_compute", r"compute savings plan"),
    ("savings_plan_ec2", r"ec2 instance savings plan"),
    ("reserved_instances", r"reserved instance"),
    ("nat_gateway", r"nat gateway"),
    ("vpc_peering", r"vpc peering"),
    ("transit_gateway", r"transit gateway"),
    ("direct_connect", r"direct connect"),
    ("site_to_site_vpn", r"site-to-site vpn"),
    ("global_accelerator", r"global accelerator"),
    ("route53_failover", r"failover routing|active-passive failover"),
    ("route53_latency", r"latency.based routing|latency routing"),
    ("route53_geolocation", r"geolocation routing"),
    ("route53_geoproximity", r"geoproximity"),
    ("ecs_fargate", r"fargate"),
    ("eks", r"elastic kubernetes service|\beks\b"),
    ("step_functions", r"step functions"),
    ("sqs_fifo", r"sqs fifo|fifo queue"),
    ("sqs", r"simple queue service|\bsqs\b"),
    ("sns", r"simple notification service|\bsns\b"),
    ("eventbridge", r"eventbridge|cloudwatch events"),
    ("kinesis_streams", r"kinesis data stream"),
    ("kinesis_firehose", r"kinesis (data )?firehose"),
    ("athena", r"amazon athena"),
    ("glue_etl", r"aws glue"),
    ("emr", r"amazon emr"),
    ("redshift", r"amazon redshift"),
    ("datasync", r"datasync"),
    ("snowball", r"snowball"),
    ("storage_lens", r"storage lens"),
    ("backup_service", r"aws backup"),
    ("trusted_advisor", r"trusted advisor"),
    ("compute_optimizer", r"compute optimizer"),
    ("cost_explorer", r"cost explorer"),
    ("budgets", r"aws budgets"),
    ("session_manager", r"session manager"),
    ("ssm_patch", r"patch manager|run command"),
    ("cloudtrail", r"cloudtrail"),
    ("aws_config", r"aws config"),
    ("vpc_flow_logs", r"vpc flow log"),
    ("efs", r"elastic file system|\befs\b"),
    ("ebs_gp3", r"\bgp3\b"),
    ("ebs_io", r"provisioned iops|\bio1\b|\bio2\b"),
    ("ebs_recycle_bin", r"recycle bin"),
    ("acm", r"certificate manager|\bacm\b"),
    ("api_gateway", r"api gateway"),
    ("cognito", r"cognito"),
    ("textract", r"textract"),
    ("comprehend", r"comprehend"),
    ("rekognition", r"rekognition"),
    ("control_tower", r"control tower"),
    ("identity_center", r"iam identity center|single sign-on|permission set"),
]

COMPILED = [(name, re.compile(pat, re.IGNORECASE)) for name, pat in TAGS]


def correct_answer_text(q):
    ans = q.get("answer")
    opts = q.get("options", {})
    keys = ans if isinstance(ans, list) else [ans]
    return " ".join(opts.get(k, "") for k in keys)


def tag_question(q):
    text = correct_answer_text(q)
    tags = frozenset(name for name, rx in COMPILED if rx.search(text))
    return tags


def main():
    path = os.path.join(ROOT, "quiz-new.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    groups = defaultdict(list)
    for q in data:
        tags = tag_question(q)
        if not tags:
            continue
        key = (q.get("topic", ""), tags)
        groups[key].append(q["id"])

    multi = {k: v for k, v in groups.items() if len(v) > 1}
    print(f"Total tagged groups: {len(groups)}; groups with >1 member: {len(multi)}")
    total_covered = sum(len(v) for v in multi.values())
    print(f"Total questions in multi-member tag groups: {total_covered}")

    id_to_q = {q["id"]: q for q in data}
    report = []
    for (topic, tags), ids in sorted(multi.items(), key=lambda x: -len(x[1])):
        report.append({
            "topic": topic,
            "tags": sorted(tags),
            "count": len(ids),
            "ids": sorted(ids),
            "stems": [id_to_q[i]["question"][:90].replace("\n", " ") for i in sorted(ids)]
        })

    with open(os.path.join(ROOT, "scripts/tag_groups.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("wrote tag_groups.json")


if __name__ == "__main__":
    main()
