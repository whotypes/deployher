[deployher.com]: https://deployher.com
[garage]: https://garagehq.deuxfleurs.fr/
[drizzle]: https://orm.drizzle.team/
[bun]: https://bun.sh/
[redis]: https://redis.io/
[postgres]: https://www.postgresql.org/
[docker]: https://www.docker.com/
[docker-compose]: https://docs.docker.com/compose/

# [deployher.com](deployher.com)

Deployher is a platform for deploying web applications. I created deployher to build out my first PaaS project. It is built with [garage], [drizzle], [bun], [redis], [postgres], and [docker]. The application is able to be 100% self-hosted on your own hardware.

### Minimum Requirements

- 4GB of RAM
 - 1 GB RAM 



## Running locally

Deployments need S3 (Garage), Postgres, and Redis. From `backend/`:

```bash
./infra/dev.sh start
```

This starts Docker services (Garage, Postgres, Redis), creates a Garage bucket and key, and injects `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` into `.env`. Then run migrations and seed.
