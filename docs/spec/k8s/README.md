# Kubernetes manifests — Booking Service (template for the other services)

## Concept mapping ↔ Kubernetes

| Concept discussed | In Kubernetes |
|---|---|
| ALB | **Ingress** (+ Ingress Controller, e.g. NGINX) |
| Target Group | **Service** (selects pods via label selector) |
| Container | **Pod** |
| Orchestrator (monitoring & self-healing) | **Deployment controller** (based on `replicas` + probes) |
| Auto Scaling | **HorizontalPodAutoscaler (HPA)** |
| "Always keep a minimum of N containers during maintenance" | **PodDisruptionBudget (PDB)** |

## Setup (assumes a cluster already exists — minikube/k3s/EKS all work)

```bash
# 1. Install the NGINX Ingress Controller (if not already installed)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

# 2. Install metrics-server (required for HPA to read CPU/RAM)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 3. Apply all of the service's manifests
kubectl apply -f configmap-secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f ingress.yaml
```

## Demoing the "self-replace on crash" mechanism (well worth including in the report/defense)

```bash
# Watch the running pods
kubectl get pods -l app=booking-service -w

# In another terminal, simulate a crashed container by deleting a pod directly
kubectl delete pod <any-pod-name>

# Back in the first terminal — you'll see:
#   - The old pod goes "Terminating"
#   - A NEW pod is automatically created almost immediately (the Deployment controller
#     detects actual_count < desired_count=3 and compensates)
#   - After a few seconds, the new pod becomes "Running" and "Ready" (passes the readiness probe)
```

Screen-recording this is the best visual evidence for the "self-healing system" section of the report.

## Demoing Auto Scaling

```bash
# Watch the HPA in real time
kubectl get hpa booking-service-hpa -w

# Generate fake load to trigger scale-up (requires hey or k6)
hey -z 2m -c 200 http://api.ticketplatform.local/booking/health

# Watch the REPLICAS column in the kubectl get hpa output climb as CPU exceeds 60%
```

## Notes for applying this to the other 5 services

Copy the 6 files in this folder, and change:
- `booking-service` → the other service's name (`event-service`, `payment-service`...)
- `replicas` / `minReplicas` / `maxReplicas` in `hpa.yaml` per the capacity table computed in the deployment document (e.g. Event Service reads a lot but writes little, so it may scale differently from Booking Service)
- The paths in `ingress.yaml` are already combined for all services; just add/edit when a new service appears

## Points worth emphasizing when defending the project

- Clearly distinguish **liveness** (still alive? → kill & recreate) and **readiness** (ready for traffic yet? → just pause sending traffic) — a question the committee likes to ask.
- `maxUnavailable: 0` in the rolling update guarantees deploying a new version **with zero downtime**.
- HPA + PDB together solve 2 different problems: HPA handles **high load**, PDB handles **maintenance/infra upgrades** without taking the service down.
