-- =============================================================================
-- warehouse_receive_inventory: SECURITY DEFINER RPC for Warehouse Inventory In.
-- Bypasses RLS; use when client direct writes hit "permission denied for table inventory".
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
begin
  select id
  into v_warehouse_id
  from public.locations
  where type = 'warehouse'
  limit 1;

  if v_warehouse_id is null then
    raise exception 'No warehouse location configured';
  end if;

  insert into public.inventory (
    product_id,
    location_id,
    quantity
  )
  values (
    p_product_id,
    v_warehouse_id,
    p_quantity
  )
  on conflict (product_id, location_id)
  do update set quantity = public.inventory.quantity + excluded.quantity;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    destination_location,
    note,
    source
  )
  values (
    p_product_id,
    'receive',
    p_quantity,
    v_warehouse_id,
    coalesce(p_notes, 'Manual warehouse inventory receive'),
    'warehouse_inventory_in'
  );
end;
$$;

grant execute on function public.warehouse_receive_inventory(uuid, integer, text) to authenticated;
