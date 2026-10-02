-- Read-only operator proposal. Run only in Jonathan's private authorized dashboard.
-- No website grants/view/API. One owner contributes once per normalized name/provider.
select lower(investment_name) as investment_name, lower(provider) as provider,
       count(distinct user_id) as requesters,
       min(received_at) as first_received_at, max(received_at) as latest_received_at
from public.arbor_investment_requests
group by lower(investment_name),lower(provider)
order by requesters desc,latest_received_at desc;
