# Tóm tắt kiến thức AWS SAA — rút ra từ 1019 câu hỏi (quiz-new.json)

> Tài liệu này gom các "quy tắc quyết định" (decision rules) lặp lại nhiều lần trong bộ câu hỏi,
> theo 4 domain của kỳ thi AWS Solutions Architect Associate. Dùng để ôn nhanh trước khi làm
> `quiz-new-2.json`. Không thay thế việc đọc explanation chi tiết của từng câu.

## 1. Design Secure Architectures

**IAM & truy cập**
- EC2/Lambda gọi AWS service khác → luôn dùng **IAM Role** (instance profile / execution role), **không** dùng IAM User + access key nhúng trong code.
- Truy cập chéo account (cross-account) → tạo **IAM Role có trust policy** trỏ tới account/role kia rồi `sts:AssumeRole`. IAM Group **không thể** là principal trong trust policy.
- Least privilege S3: `s3:ListBucket` là quyền cấp **bucket** (ARN `bucket-name`); `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject` là quyền cấp **object** (ARN `bucket-name/*`). Thiếu đúng cấp ARN là lỗi hay gặp.
- IAM Identity Center (SSO): quản lý quyền nhiều account bằng **Permission Set + Group**, gán cho group chứ không gán lẻ từng user → thêm nhân viên mới chỉ cần add vào group.

**Mã hoá & bí mật**
- AWS KMS: **Customer managed key** mới cho phép bật/tắt **automatic key rotation** (mặc định 365 ngày) hoặc kiểm soát rotation thủ công; **AWS managed key** tự rotate nhưng không cấu hình được; key **import key material** (external) **không hỗ trợ** automatic rotation.
- Muốn cùng key material ở nhiều Region (replicate dữ liệu cross-region, vẫn 1 key) → **KMS multi-Region key**.
- Chia sẻ snapshot/AMI mã hoá cross-account → phải chia sẻ **cả KMS key** (key policy cho phép account đích), không chỉ chia sẻ snapshot.
- Cần rotate **mật khẩu/credential** (DB, API key) → **AWS Secrets Manager** (hỗ trợ auto-rotation qua Lambda). **Parameter Store SecureString** mã hoá bằng KMS nhưng **không tự rotate** — dùng khi chỉ cần lưu trữ, không cần rotation.
- Mã hoá S3 "ít effort nhất + rotate hằng năm" → SSE-KMS + CMK + automatic rotation bật sẵn (không phải client-side encryption, không phải SSE-S3).
- EKS: bí mật Kubernetes lưu trong `etcd` **không tự mã hoá bằng KMS** — phải chủ động bật **envelope encryption cho Secrets** khi tạo cluster.

**Mạng riêng tư (không đi qua Internet)**
- Gateway VPC Endpoint: chỉ có cho **S3** và **DynamoDB**, **miễn phí**, cần thêm route trong route table.
- Interface VPC Endpoint (AWS PrivateLink): dùng cho hầu hết service khác (API Gateway private, Kinesis, SQS...), **tính phí theo giờ + theo GB**, dùng ENI trong subnet.
- NAT Gateway: đặt ở **public subnet**, dùng cho **outbound** internet từ private subnet (không có inbound) — **không** dùng để truy cập S3/DynamoDB riêng tư (dùng Gateway Endpoint rẻ hơn/nhanh hơn).
- Muốn on-premises DNS resolve được private hosted zone / ngược lại → **Route 53 Resolver outbound endpoint** (VPC → on-prem) hoặc **inbound endpoint** (on-prem → VPC), đi kèm **Resolver rule**.

**Bảo vệ ứng dụng / DDoS**
- **AWS WAF**: bảo vệ layer 7 (SQL injection, XSS) — gắn được vào **ALB, API Gateway, CloudFront**; **KHÔNG** gắn được vào Network Load Balancer.
- **AWS Firewall Manager**: khi cần áp WAF rule **tập trung nhiều account/Region** với ít effort quản trị nhất.
- **AWS Shield Advanced**: bảo vệ DDoS nâng cao, hỗ trợ ALB/CloudFront/Route 53/EIP (NLB qua Elastic IP); có DRT (DDoS Response Team) và chế độ proactive engagement (cần gắn Route 53 health check).
- **Amazon GuardDuty**: phát hiện hoạt động bất thường/độc hại liên tục nhưng **không tự chặn** — muốn tự động phản ứng thì bắt sự kiện qua **EventBridge → Lambda** (vd cập nhật WAF rule).
- **Amazon Macie**: phát hiện dữ liệu nhạy cảm (PII) trong S3. **Amazon Inspector**: quét lỗ hổng (CVE) trên EC2/ECR/Lambda. Đừng nhầm 2 dịch vụ này.

**Quản trị nhiều account**
- **Service Control Policy (SCP)** trong AWS Organizations: giới hạn hành động cho **toàn bộ** account/OU, áp dụng cả với **root user** của member account. Đây là preventive control, khác với AWS Config (chỉ detective/báo cáo, không ngăn chặn).
- **AWS Control Tower**: cung cấp sẵn preventive guardrail phổ biến (chặn Region ngoài whitelist, chặn internet gateway...).
- **Trusted Advisor**: recommendation của 1 resource thường xem ở **account sở hữu resource đó**; nếu dùng AWS Organizations + Trusted Advisor tích hợp thì có thể xem tổng hợp từ **management account**.
- Root user email nên dùng **alias/distribution list** dùng chung cho team, không gắn với 1 cá nhân; cấu hình thêm **alternate contacts** (billing/operations/security) theo từng account.

**Chứng chỉ & bảo vệ dữ liệu tĩnh**
- ACM certificate cho **CloudFront** phải request/import ở **us-east-1** dù CloudFront là dịch vụ toàn cầu; cho ALB/API Gateway thì request **cùng Region** với resource.
- **DNS validation** cho ACM cho phép auto-renew; **Email validation** thì không.
- **S3 Object Lock**: WORM — **compliance mode** không ai xoá/sửa được kể cả root (dùng cho yêu cầu pháp lý), **governance mode** có thể bị user có quyền đặc biệt bypass.
- **S3 Versioning + MFA Delete**: chống xoá nhầm/không có chủ đích.

## 2. Design Resilient Architectures

**Cơ sở dữ liệu HA**
- **RDS/Aurora Multi-AZ**: standby đồng bộ, **không** phục vụ read traffic, chỉ để failover tự động (nhầm lẫn thường gặp: nghĩ standby giúp scale đọc — SAI).
- **Read Replica**: bất đồng bộ, **có** phục vụ read traffic, dùng để scale đọc / offload reporting khỏi primary; có thể promote thành instance độc lập.
- **Aurora Multi-AZ DB Cluster** (khác Multi-AZ instance): có 1 writer + 2 reader **có thể đọc được**, kết hợp HA + read scaling trong 1 cấu hình.
- **Aurora Global Database**: replicate cross-Region, RPO thấp (~1 giây), dùng cho DR toàn cầu.
- RDS automated backup: retention tối đa **35 ngày**. Cần giữ lâu hơn (vài năm) → dùng **AWS Backup** với backup plan + lifecycle.

**Chiến lược Disaster Recovery (RTO/RPO tăng dần chi phí)**
1. Backup & Restore — rẻ nhất, RTO/RPO cao nhất.
2. Pilot Light — lõi hệ thống (DB) chạy sẵn tối thiểu, phần còn lại bật khi cần.
3. Warm Standby — hạ tầng đầy đủ chạy ở capacity nhỏ tại Region phụ, **không phục vụ traffic** khi primary khoẻ, Route 53 **active-passive failover**. Đáp ứng tốt yêu cầu kiểu "RTO ~30 phút, không cần chịu tải khi bình thường".
4. Multi-site Active-Active — đắt nhất, RTO/RPO gần 0.

**Nhắn tin & giải kết nối (decoupling)**
- **SQS**: hàng đợi buffer, giải kết nối producer/consumer, hấp thụ traffic spike.
- **SNS**: pub/sub, fan-out 1 message tới nhiều subscriber (SQS, Lambda, email...).
- **SNS FIFO + SQS FIFO**: khi cần đảm bảo **thứ tự** + **exactly-once**/dedup xuyên suốt nhiều consumer.
- Message > 256KB → **Amazon SQS Extended Client Library** (lưu payload thật trong S3, SQS chỉ giữ pointer).
- Job xử lý > 15 phút → không dùng Lambda được, chuyển sang **Fargate/ECS/Batch**.
- Xử lý song song quy mô lớn (hàng nghìn item từ S3) mà vẫn serverless → **Step Functions Distributed Map**.

**Lưu trữ chia sẻ**
- **EFS**: file storage NFS multi-AZ cho **Linux**, mount đồng thời nhiều EC2. **Không hỗ trợ Windows.**
- **FSx for Windows File Server**: SMB, dùng khi EC2 là **Windows** cần chia sẻ file.
- **FSx for Lustre**: HPC, throughput cao, latency dưới mili-giây, tích hợp import/export với S3.
- **FSx for NetApp ONTAP**: hỗ trợ đồng thời cả NFS **và** SMB trên cùng volume, Multi-AZ.
- **Storage Gateway**:
  - *File Gateway*: expose NFS/SMB, lưu thật trên S3, cache dữ liệu nóng cục bộ.
  - *Volume Gateway – cached volumes*: dữ liệu chính ở S3, chỉ cache phần hay dùng tại chỗ (giảm tải on-prem).
  - *Volume Gateway – stored volumes*: dữ liệu chính vẫn ở on-prem (latency thấp toàn bộ dataset), snapshot định kỳ lên S3 để backup/DR.
  - *Tape Gateway*: thay thế tape vật lý bằng virtual tape library (iSCSI-VTL), giữ nguyên phần mềm backup hiện có.
- **AWS DataSync**: đồng bộ file **liên tục/lặp lại** giữa on-prem (NFS/SMB) và S3/EFS/FSx — khác Snowball (chuyển 1 lần khối lượng lớn khi băng thông mạng không đủ).

**Load balancing & network resilience**
- **ALB**: layer 7, HTTP(S), path/host-based routing, health check theo URL, tích hợp WAF.
- **NLB**: layer 4, TCP/UDP, static IP, hiệu năng cực cao, **không** tích hợp WAF trực tiếp.
- **Gateway Load Balancer**: chèn network virtual appliance (firewall bên thứ 3) vào luồng traffic.
- **AWS Global Accelerator**: routing TCP/UDP tới endpoint khoẻ mạnh gần nhất qua AWS backbone, cấp static anycast IP — hợp cho ứng dụng không phải HTTP (gaming UDP, VoIP) hoặc cần multi-Region failover nhanh cho NLB/ALB/EC2/EIP.
- **Amazon CloudFront**: cache nội dung HTTP(S) tại edge — tối ưu cho web (static + dynamic qua ALB origin), không phải để "route" traffic non-HTTP.
- **Route 53 routing policy**: *Latency* (đo latency thực để chọn Region nhanh nhất), *Geolocation* (giới hạn theo quốc gia — dùng khi có ràng buộc pháp lý/phân phối bản quyền), *Geoproximity* (dịch chuyển traffic bằng bias), *Weighted* (chia tỉ lệ/test A-B), *Failover* (active-passive cho DR).

## 3. Design High-Performing Architectures

**Caching**
- **CloudFront**: cache HTTP(S) ở edge, giảm tải origin.
- **ElastiCache for Redis**: hỗ trợ replication + AOF persistence + Multi-AZ, sorted set (leaderboard), pub/sub — chọn khi cần HA/durability.
- **ElastiCache for Memcached**: đơn giản hơn, **không** có replication/persistence — chỉ dùng cho cache thuần, có thể mất dữ liệu khi restart.
- **DynamoDB Accelerator (DAX)**: cache riêng cho DynamoDB, độ trễ micro-giây, không cần đổi code nhiều.
- **RDS Proxy**: connection pooling cho Lambda/serverless → tránh cạn kết nối DB khi traffic biến động; cũng cải thiện trải nghiệm khi Aurora failover.

**Phân tích dữ liệu**
- **Amazon Athena**: SQL trực tiếp trên dữ liệu S3, serverless, trả tiền theo dữ liệu quét — hay đi kèm AWS Glue Data Catalog.
- **AWS Glue**: ETL managed (crawler phát hiện schema + job transform), ví dụ chuyển CSV → Parquet.
- **Kinesis Data Streams**: ingest streaming tùy biến, cần tự viết consumer (Lambda/KCL/EC2).
- **Kinesis Data Firehose**: managed delivery streaming trực tiếp tới S3/Redshift/OpenSearch, không cần quản lý consumer.
- **Amazon EMR**: xử lý song song dữ liệu lớn (Spark/Hadoop) trên S3.
- **Amazon Redshift**: data warehouse SQL quy mô petabyte.

**Compute & storage performance**
- **EBS gp3**: tách IOPS/throughput khỏi dung lượng ổ đĩa, rẻ hơn gp2/io1 cho tải tầm trung (≤ 16,000 IOPS) — là lựa chọn "cost-effective" mặc định khi đề cho phép cấu hình IOPS độc lập.
- **EBS io1/io2 (Provisioned IOPS)**: latency thấp nhất, IOPS cao nhất, dùng cho workload rất nhạy cảm I/O. Có thể "stripe" nhiều volume (LVM) để vượt giới hạn IOPS/volume.
- **Enhanced Networking + Cluster Placement Group**: latency mạng thấp nhất giữa các instance (HPC, cùng 1 AZ).
- **S3 Transfer Acceleration**: tăng tốc upload/download qua edge location cho user toàn cầu — khác CloudFront (không cache, chỉ tăng tốc đường truyền tới S3).
- **API Gateway HTTP API**: rẻ và đơn giản hơn REST API khi không cần tính năng nâng cao.
- **Lambda function URL**: endpoint HTTPS trực tiếp cho 1 Lambda, hỗ trợ xác thực `AWS_IAM` — đơn giản hơn dựng cả API Gateway khi chỉ có 1 function.
- **Lambda Provisioned Concurrency**: giảm cold start cho traffic có thể dự đoán (kết hợp scheduled scaling of provisioned concurrency cho giờ cao điểm biết trước).
- **ECS/EKS trên Fargate**: compute serverless cho container, không quản lý node; **ECS Anywhere / EKS Anywhere / EKS Connector**: mở rộng quản lý container hybrid on-prem + xem tập trung trên AWS console.

## 4. Design Cost-Optimized Architectures

**Hosting tĩnh & giảm hạ tầng**
- Website chỉ có static content trên EC2+ALB → chuyển sang **S3 + CloudFront** luôn là câu trả lời rẻ nhất (bỏ hẳn EC2/ALB).

**EC2 purchasing options (từ linh hoạt → rẻ nhất khi cam kết)**
- **On-Demand**: linh hoạt tuyệt đối, không cam kết, dùng khi cần thay đổi instance family thường xuyên trong ngắn hạn hoặc worker không cố định (khi bị stop/start).
- **Spot**: rẻ nhất, nhưng có thể bị thu hồi — chỉ hợp workload chịu gián đoạn (batch, stateless, fault-tolerant).
- **Savings Plans – Compute SP**: áp dụng cho **EC2 + Fargate + Lambda**, không ràng buộc instance family/Region → chọn khi cần đổi loại instance thường xuyên (2–3 tháng/lần) nhưng vẫn muốn giảm giá.
- **Savings Plans – EC2 Instance SP**: giảm giá sâu hơn Compute SP nhưng **giới hạn 1 family + 1 Region** → chọn khi tải ổn định, không đổi family.
- **Reserved Instances**: cam kết cấu hình instance cụ thể (1–3 năm), giảm giá cao nhất cho workload chạy liên tục lâu dài (All Upfront giảm nhiều nhất). Trong Organizations, muốn chia sẻ discount giữa các account → bật **"discount sharing"** ở Billing preferences của **management account**.
- **Dedicated Host**: cần visibility theo socket/core (license theo socket/core, BYOL).

**S3 storage classes (theo access pattern, từ "nóng" → "lạnh")**
- **S3 Standard**: truy cập thường xuyên.
- **S3 Standard-IA**: truy cập tức thời, ít truy cập nhưng **có thể đoán trước** (vd sau 30 ngày), vẫn multi-AZ.
- **S3 One Zone-IA**: rẻ hơn Standard-IA nhưng chỉ 1 AZ → chỉ dùng cho dữ liệu **có thể tái tạo lại** được.
- **S3 Intelligent-Tiering**: access pattern **không dự đoán được / thay đổi liên tục** → tự động chuyển tier, vẫn giữ multi-AZ và độ trễ tức thời (có thêm phí monitoring nhỏ/object).
- **S3 Glacier Instant Retrieval**: dữ liệu hiếm khi truy cập nhưng vẫn cần **truy cập tức thời** — rẻ hơn Standard-IA cho dữ liệu tồn tại lâu dài, ít động vào.
- **S3 Glacier Flexible Retrieval**: cần phục hồi (phút–giờ) trước khi đọc được, không cần truy cập ngay lập tức.
- **S3 Glacier Deep Archive**: rẻ nhất, phục hồi trong ~12 giờ — hợp lưu trữ dài hạn (audit log nhiều năm, archival).
- Nhớ: **S3 Lifecycle chỉ áp dụng cho object hiện tại (current version)**; nếu bucket có Versioning bật, phải thêm rule cho **noncurrent version** để tránh phình dung lượng vô hạn.
- Multipart upload dở dang vẫn tính phí lưu trữ → thêm lifecycle rule **abort incomplete multipart upload**.

**Công cụ theo dõi & tối ưu chi phí**
- **AWS Compute Optimizer**: gợi ý rightsizing cho EC2/ASG/EBS/Lambda kèm ước tính tiết kiệm hàng tháng.
- **AWS Trusted Advisor**: check "Reserved Instance Optimization", "idle resources"...
- **Cost Explorer**: báo cáo/lọc chi phí theo tag, downloadable.
- **Cost Allocation Tags**: với Organizations phải **activate ở management account** mới dùng được cho báo cáo toàn tổ chức.
- **AWS Budgets**: có loại "Savings Plans coverage budget" để cảnh báo khi coverage giảm.

**Giảm chi phí mạng & di chuyển dữ liệu**
- **Gateway VPC Endpoint (S3, DynamoDB)**: miễn phí, thay thế NAT Gateway (NAT tính phí theo giờ + theo GB xử lý) cho truy cập riêng tư tới 2 service này.
- **AWS Snowball / Snowball Edge**: hiệu quả nhất khi cần chuyển dữ liệu rất lớn (hàng trăm TB–PB) mà băng thông mạng hiện có không đủ/đang bận việc khác.
- **AWS DataSync**: khi cần đồng bộ liên tục, incremental (không phải chuyển 1 lần).

**Auto Scaling & container cost**
- **Scheduled Scaling**: tải tăng theo lịch **biết trước** (đầu tháng, tối thứ Sáu...) → scale trước để tránh cold-start và không cần giữ capacity dư thừa cả ngày.
- **Warm pools**: workload khởi động chậm (load nhiều dữ liệu vào RAM) → giữ sẵn instance "ấm" (kể cả hibernate) thay vì khởi động lại từ đầu.
- **Fargate Spot** kết hợp **Fargate on-demand**: on-demand cho baseline luôn cần sẵn sàng, Spot cho phần tải tăng đột biến ngắn hạn.
- **Storage Gateway Tape Gateway**: bỏ chi phí tape vật lý mà vẫn giữ nguyên phần mềm/quy trình backup hiện tại.

---

## 5. Bẫy / nhầm lẫn thường gặp (common pitfalls)

| Nhầm lẫn | Sự thật |
|---|---|
| Multi-AZ standby giúp scale read | **Sai** — standby chỉ để failover, không nhận read traffic. Muốn scale read → Read Replica |
| EFS dùng được cho Windows EC2 | **Sai** — EFS chỉ cho Linux (NFS). Windows dùng FSx for Windows File Server (SMB) |
| NAT Gateway cần thiết để truy cập S3 riêng tư | Không cần nếu dùng **Gateway VPC Endpoint** (miễn phí, nhanh hơn) |
| AWS WAF gắn được vào NLB | **Sai** — WAF chỉ gắn ALB / API Gateway / CloudFront |
| Security Group có rule "deny" | **Sai** — SG chỉ có "allow", muốn deny dùng Network ACL (stateless) |
| RDS automated backup giữ được nhiều năm | **Sai** — tối đa 35 ngày; cần lâu hơn → AWS Backup |
| KMS "imported key material" tự động rotate được | **Sai** — chỉ customer managed key (tạo bằng KMS) mới rotate tự động được |
| ACM cho CloudFront request ở Region bất kỳ | **Sai** — bắt buộc **us-east-1** |
| Lambda chạy job > 15 phút | **Sai** — giới hạn cứng 15 phút, `/tmp` tối đa 10,240 MB. Job dài hơn/cần disk lớn hơn → Fargate/ECS/Batch |
| Compute Savings Plan == EC2 Instance Savings Plan | **Khác** — Compute SP phủ EC2+Fargate+Lambda (linh hoạt hơn, giảm giá thấp hơn); EC2 Instance SP chỉ EC2 1 family/Region (giảm giá sâu hơn, kém linh hoạt hơn) |
| S3 Lifecycle tự dọn cả noncurrent version khi bật Versioning | **Sai** — phải khai báo rule riêng cho noncurrent version, nếu không dung lượng cứ tăng dù xoá "current" |
| IAM Group có thể là principal trong trust policy cross-account | **Sai** — chỉ IAM Role/User cụ thể, Group không assume role được |

---

*Tài liệu được tổng hợp tự động + kiểm chứng thủ công từ các cụm câu hỏi lặp lại trong `quiz-new.json` (script phân tích trong thư mục `scripts/`). Một số câu hỏi diễn đạt khác nhau nhưng cùng bài học đã được gộp trong `quiz-new-2.json`, danh sách id các câu tương tự được ghi chú ngay trong phần `explanation` của câu giữ lại.*
