-- IMM v0.4 analytics helpers -------------------------------------------------

create or replace view view_enrollments_active as
select e.*,
       c.project_id,
       c.weekday,
       c.shift,
       c.capacity,
       c.location
  from enrollments e
  join cohorts c on c.id = e.cohort_id
 where e.status = 'active';

create or replace view view_consents_status as
select b.id as beneficiary_id,
       b.full_name,
       c.type,
       c.text_version,
       c.granted,
       c.granted_at,
       c.revoked_at,
       case
         when c.revoked_at is not null then 'revoked'
         when c.granted then 'granted'
         else 'pending'
       end as status
  from beneficiaries b
  left join consents c on c.beneficiary_id = b.id;

create or replace view view_vulnerabilities_counts as
select v.slug,
       v.label,
       count(distinct bv.beneficiary_id) as total
  from vulnerabilities v
  left join beneficiary_vulnerabilities bv on bv.vulnerability_id = v.id
 group by v.id
 order by total desc;

create or replace view view_neighborhood_counts as
select coalesce(lower(trim(b.neighborhood)), 'não informado') as neighborhood,
       count(*) as total
  from beneficiaries b
 group by neighborhood
 order by total desc;

create or replace view view_project_capacity_utilization as
with cohort_capacity as (
  select c.id as cohort_id, c.project_id, c.capacity
    from cohorts c
),
cohort_occupancy as (
  select e.cohort_id, count(*) filter (where e.status = 'active')::int as ocupadas
    from enrollments e
   group by e.cohort_id
)
select p.id as project_id,
       p.name,
       coalesce(sum(coalesce(o.ocupadas, 0)), 0) as ocupadas,
       coalesce(sum(coalesce(cc.capacity, 0)), 0) as capacidade
  from projects p
  left join cohort_capacity cc on cc.project_id = p.id
  left join cohort_occupancy o on o.cohort_id = cc.cohort_id
 group by p.id;

create or replace view view_action_items_status_counts as
select ai.status,
       count(*) as total
  from action_items ai
 group by ai.status;

create or replace function imm_attendance_rate_by_enrollment(
  in from_date date,
  in to_date date,
  in filter_project_ids uuid[] default null,
  in filter_cohort uuid default null
) returns table (
  enrollment_id uuid,
  cohort_id uuid,
  project_id uuid,
  total_sessions integer,
  present_sessions integer,
  attendance_rate numeric
) as $$
  select e.id,
         e.cohort_id,
         c.project_id,
         count(a.id)::int as total_sessions,
         count(a.id) filter (where a.present)::int as present_sessions,
         case when count(a.id) = 0 then null else count(a.id) filter (where a.present)::numeric / count(a.id) end as attendance_rate
    from enrollments e
    join cohorts c on c.id = e.cohort_id
    left join attendance a on a.enrollment_id = e.id
                       and (from_date is null or a.date >= from_date)
                       and (to_date is null or a.date <= to_date)
   where (filter_cohort is null or e.cohort_id = filter_cohort)
     and (filter_project_ids is null or c.project_id = any(filter_project_ids))
   group by e.id, c.project_id;
$$ language sql stable;

create or replace function imm_attendance_rate_by_cohort(
  in from_date date,
  in to_date date,
  in filter_project_ids uuid[] default null,
  in filter_cohort uuid default null
) returns table (
  cohort_id uuid,
  project_id uuid,
  total_sessions integer,
  present_sessions integer,
  attendance_rate numeric
) as $$
  select sub.cohort_id,
         sub.project_id,
         sum(sub.total_sessions)::int as total_sessions,
         sum(sub.present_sessions)::int as present_sessions,
         case when sum(sub.total_sessions) = 0 then null else sum(sub.present_sessions)::numeric / sum(sub.total_sessions) end as attendance_rate
    from imm_attendance_rate_by_enrollment(from_date, to_date, filter_project_ids, filter_cohort) sub
   group by sub.cohort_id, sub.project_id;
$$ language sql stable;

create or replace function imm_age_distribution()
returns table (
  bucket text,
  total integer
) as $$
  with ages as (
    select extract(year from age(coalesce(b.birth_date, current_date)))::int as years
      from beneficiaries b
  ), buckets as (
    select case
             when years is null then 'não informado'
             when years < 13 then '0-12'
             when years between 13 and 17 then '13-17'
             when years between 18 and 24 then '18-24'
             when years between 25 and 34 then '25-34'
             when years between 35 and 44 then '35-44'
             when years between 45 and 59 then '45-59'
             else '60+'
           end as bucket
      from ages
  )
  select bucket, count(*)::int as total
    from buckets
   group by bucket
   order by bucket;
$$ language sql stable;

create or replace function imm_series_new_beneficiaries(
  in from_date date,
  in to_date date,
  in interval_granularity text,
  in filter_project_ids uuid[] default null
) returns table (bucket_date date, total int) as $$
  with series as (
    select generate_series(from_date, to_date, case interval_granularity
      when 'month' then interval '1 month'
      when 'week' then interval '1 week'
      else interval '1 day' end) as bucket
  ),
  data as (
    select date_trunc(case interval_granularity when 'month' then 'month' when 'week' then 'week' else 'day' end, b.created_at)::date as bucket,
           count(distinct b.id)::int as total
      from beneficiaries b
      left join enrollments e on e.beneficiary_id = b.id
      left join cohorts c on c.id = e.cohort_id
     where b.created_at::date between from_date and to_date
       and (filter_project_ids is null or c.project_id = any(filter_project_ids))
     group by bucket
  )
  select s.bucket::date,
         coalesce(d.total, 0) as total
    from series s
    left join data d on d.bucket = s.bucket::date
   order by s.bucket;
$$ language sql stable;

create or replace function imm_series_new_enrollments(
  in from_date date,
  in to_date date,
  in interval_granularity text,
  in filter_project_ids uuid[] default null,
  in filter_cohort uuid default null
) returns table (bucket_date date, total int) as $$
  with series as (
    select generate_series(from_date, to_date, case interval_granularity
      when 'month' then interval '1 month'
      when 'week' then interval '1 week'
      else interval '1 day' end) as bucket
  ),
  data as (
    select date_trunc(case interval_granularity when 'month' then 'month' when 'week' then 'week' else 'day' end, e.created_at)::date as bucket,
           count(*)::int as total
      from enrollments e
      join cohorts c on c.id = e.cohort_id
     where e.created_at::date between from_date and to_date
       and (filter_project_ids is null or c.project_id = any(filter_project_ids))
       and (filter_cohort is null or e.cohort_id = filter_cohort)
     group by bucket
  )
  select s.bucket::date,
         coalesce(d.total, 0) as total
    from series s
    left join data d on d.bucket = s.bucket::date
   order by s.bucket;
$$ language sql stable;

create or replace function imm_series_attendance(
  in from_date date,
  in to_date date,
  in interval_granularity text,
  in filter_project_ids uuid[] default null,
  in filter_cohort uuid default null
) returns table (bucket_date date, rate numeric) as $$
  with series as (
    select generate_series(from_date, to_date, case interval_granularity
      when 'month' then interval '1 month'
      when 'week' then interval '1 week'
      else interval '1 day' end) as bucket
  ),
  data as (
    select date_trunc(case interval_granularity when 'month' then 'month' when 'week' then 'week' else 'day' end, a.date)::date as bucket,
           count(*) filter (where a.present)::numeric / nullif(count(*), 0) as rate
      from attendance a
      join enrollments e on e.id = a.enrollment_id
      join cohorts c on c.id = e.cohort_id
     where a.date between from_date and to_date
       and (filter_project_ids is null or c.project_id = any(filter_project_ids))
       and (filter_cohort is null or e.cohort_id = filter_cohort)
     group by bucket
  )
  select s.bucket::date,
         d.rate
    from series s
    left join data d on d.bucket = s.bucket::date
   order by s.bucket;
$$ language sql stable;

-- recommended indexes ---------------------------------------------------------
create index if not exists idx_attendance_enrollment_date on attendance (enrollment_id, date);
create index if not exists idx_enrollments_cohort_status on enrollments (cohort_id, status);
create index if not exists idx_cohorts_project on cohorts (project_id);
create index if not exists idx_consents_beneficiary_type on consents (beneficiary_id, type);
create index if not exists idx_action_plans_status on action_plans (status);
create index if not exists idx_action_items_status on action_items (status, action_plan_id);
