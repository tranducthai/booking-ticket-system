# Docker Swarm stack — Booking Service (mẫu cho các service khác)

Docker Swarm đơn node là những gì đồ án này thực sự chạy cho demo load/self-healing/autoscaling. Không dùng Kubernetes: trên một node local, một control plane + `kubectl` + một ingress controller không mang lại lợi ích gì hơn so với `docker stack deploy`, vốn dùng chung CLI `docker` đã dùng sẵn. K8s chỉ đáng dùng khi chạy đa node trên cloud — được ghi chú là hướng phát triển tương lai trong [../04-deployment-design.md](../04-deployment-design.md).

## Map khái niệm ↔ Docker Swarm

| Khái niệm | Kubernetes | Docker Swarm |
|---|---|---|
| Edge / định tuyến L7 | Ingress + NGINX controller | Service `api-gateway` trên một published port + routing mesh của Swarm; chỉ thêm Traefik nếu cần path-rule/rate-limit ở biên |
| "Target group" (chọn instance) | Service + label selector | Service VIP của Swarm + round-robin có sẵn qua các task khỏe mạnh |
| Một instance đang chạy | Pod | Task (một container) |
| Số lượng mong muốn + self-healing | Deployment controller (`replicas` + probe) | Vòng lặp reconciliation của Swarm manager (`deploy.replicas` + `healthcheck`) |
| Autoscale theo CPU | HorizontalPodAutoscaler (+ metrics-server) | Sidecar `autoscaler`: `docker stats` → `docker service scale` |
| Giữ N instance chạy khi bảo trì | PodDisruptionBudget | `update_config.parallelism: 1` + `order: start-first` |
| Config / secret | ConfigMap / Secret | `docker config` / `docker secret` (env thuần cho bản demo) |
| Deploy zero-downtime | RollingUpdate `maxUnavailable: 0` | `update_config: order: start-first, failure_action: rollback` |

## Cài đặt

```bash
docker swarm init                                        # one-time; a single node is fine

# build images (once each service has a Dockerfile — Phase 9)
docker build -t booking-service:local apps/booking-service
docker build -t swarm-autoscaler:local docs/spec/swarm/autoscaler

docker stack deploy -c docs/spec/swarm/docker-stack.yml ticketing
docker stack services ticketing
```

Postgres/Redis/RabbitMQ vẫn lấy từ [../../../infra/docker-compose.yml](../../../infra/docker-compose.yml).
Để có một stack tự thân (self-contained), copy các khối đó vào `docker-stack.yml` trên cùng
network `backend`.

## Demo 1 — self-healing (đáng ghi lại để bảo vệ đồ án)

```bash
# terminal 1: watch the tasks
watch -n1 docker service ps --no-trunc ticketing_booking-service

# terminal 2: kill a task's container outright (simulates a crash)
docker rm -f "$(docker ps -q -f label=com.docker.swarm.service.name=ticketing_booking-service | head -1)"
```

Ở terminal 1 bạn sẽ thấy task bị kill chuyển sang `Failed`/`Shutdown`, và manager khởi động
một task **mới** trong vài giây (nó phát hiện số đang chạy < số mong muốn = 3 và tự bù đắp). Điều
tương tự xảy ra khi `healthcheck` thất bại 3 lần liên tiếp — manager đánh dấu
task là `unhealthy` và thay thế nó.

## Demo 2 — autoscaling

```bash
# terminal 1: autoscaler decisions
docker service logs -f ticketing_autoscaler

# terminal 2: generate load (hey or k6)
hey -z 90s -c 200 http://localhost/booking/health
```

Autoscaler ghi log CPU trung bình vượt qua `CPU_UP` (60%) và in ra
`>> scale UP 3 -> 6`; `docker service ps ticketing_booking-service` khi đó sẽ hiện 6 task.
Dừng tải và sau `DOWN_COUNT` lượt đo thấp, nó tự hạ dần trở lại `MIN`.

## Healthcheck đơn của Swarm so với liveness + readiness của K8s

Swarm chỉ có **một** `healthcheck`, không phải hai probe. Hai hành vi của K8s được khôi phục bằng:

- **"liveness" (chết → thay thế):** healthcheck thất bại `retries` lần → manager kill và
  tạo lại task.
- **"readiness" (chưa sẵn sàng → không định tuyến / không chuyển đổi):** `start_period` giữ việc
  đánh giá health lại trong lúc app đang khởi động, và `update_config: order: start-first` nghĩa là một
  task mới phải pass healthcheck của nó **trước khi** task cũ bị gỡ trong lúc deploy.
  Routing mesh của Swarm chỉ gửi traffic tới các task đang pass healthcheck.

## Áp dụng cho 5 service còn lại

Copy khối `booking-service`, sau đó thay đổi:

- `image:` và các giá trị `environment:`
- Phần tương đương Ingress là path map của `api-gateway` ([../08-api-contracts.md](../08-api-contracts.md)) — không cần chỉnh gì ở đây
- Chỉ `booking-service` có `autoscaler` cho bản demo; các service khác giữ ở mức
  `replicas: 1-2` cố định (tăng `event-service` lên 2-3 — đường duyệt/tìm kiếm mang nhiều traffic đọc nhất)

## Các điểm đáng nhấn mạnh khi bảo vệ đồ án

- **Vòng lặp reconciliation** của Swarm (mong muốn so với đang chạy, thay thế phần chênh lệch) là
  cơ chế self-healing — về mặt khái niệm giống hệt một Deployment của K8s, chỉ thiếu control plane.
- **Autoscaling không phải là tính năng gốc của Swarm** (cũng không phải của K8s nếu thiếu metrics-server). Sidecar
  là một vòng lặp điều khiển tối giản, có chủ đích: *đo → so với mục tiêu → hành động → cooldown*.
  Có thể giải thích được từng dòng của `autoscale.sh` là một điểm mạnh hơn so với một HPA hộp đen.
- `order: start-first` + `failure_action: rollback` mang lại **deploy zero-downtime** và
  tự động rollback một image lỗi.
