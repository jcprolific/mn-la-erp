-- =============================================================================
-- store_receive_inventory_v2: Store Inventory In only. Same single-write pattern
-- as fixed warehouse (UPDATE once, INSERT if no row, then one movement).
-- No INSERT...ON CONFLICT DO UPDATE. Never touches warehouse.
-- =============================================================================

create or replace function public.store_receive_inventory_v2(
  p_product_id uuid,
  p_store_location_id uuid,
  p_quantity integer,
  p_notes text default null,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_type text;
  v_updated int;
begin
  if p_store_location_id is null then
    raise exception 'Store location is required' using errcode = 'P0001';
  end if;

  -- Reject warehouse: store receive must never touch warehouse.
  select type into v_location_type from public.locations where id = p_store_location_id limit 1;
  if v_location_type = 'warehouse' then
    raise exception 'Use Warehouse Inventory In for warehouse. This RPC is for store branches only.' using errcode = 'P0001';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0' using errcode = 'P0002';
  end if;

  -- Single write path: UPDATE existing row (add p_quantity once). If no row, INSERT.
  update public.inventory
  set quantity = quantity + p_quantity
  where product_id = p_product_id and location_id = p_store_location_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.inventory (product_id, location_id, quantity)
    values (p_product_id, p_store_location_id, p_quantity);
  end if;

  insert into public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source
  )
  values (
    p_product_id, 'receive', p_quantity, p_store_location_id,
    coalesce(p_notes, 'Store receive'),
    'store_inventory_in'
  );
end;
$$;

comment on function public.store_receive_inventory_v2(uuid, uuid, integer, text, text) is
  'Store Inventory In: adds p_quantity to store branch inventory exactly once; logs one movement with source store_inventory_in. Rejects warehouse location.';

grant execute on function public.store_receive_inventory_v2(uuid, uuid, integer, text, text) to authenticated;
