-- =============================================================================
-- Fix warehouse quantity doubling: ensure inventory is updated exactly once per call.
-- Replaces INSERT...ON CONFLICT with explicit UPDATE-then-INSERT so only one write.
-- =============================================================================

create or replace function public.warehouse_receive_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_updated int;
begin
  select id into v_warehouse_id
  from public.locations
  where type = 'warehouse'
  limit 1;

  if v_warehouse_id is null then
    raise exception 'No warehouse location configured';
  end if;

  -- Single write path: UPDATE existing row (add p_quantity once). If no row, INSERT.
  update public.inventory
  set quantity = quantity + p_quantity
  where product_id = p_product_id and location_id = v_warehouse_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.inventory (product_id, location_id, quantity)
    values (p_product_id, v_warehouse_id, p_quantity);
  end if;

  insert into public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source
  )
  values (
    p_product_id, 'receive', p_quantity, v_warehouse_id,
    coalesce(p_notes, 'Manual warehouse inventory receive'),
    'warehouse_inventory_in'
  );
end;
$$;

comment on function public.warehouse_receive_inventory(uuid, integer, text) is
  'Warehouse Inventory In: adds p_quantity to warehouse inventory exactly once; logs one movement.';
