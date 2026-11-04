/* Beta 3.9.6: preserve operational scope; extend only explicitly selected contract factories. */
(function(global){
  'use strict';
  const WRAPPER='df_measurement_company_scope_sites';
  function missingWrapper(error){
    if(!error||!['PGRST202','42883'].includes(String(error.code||'')))return false;
    return /\bfunction\s+(?:\"?public\"?\.)?\"?df_measurement_company_scope_sites\"?(?=\s|\()/i.test(String(error.message||''));
  }
  async function request(client){
    if(!client||typeof client.rpc!=='function')throw Error('온라인 연결을 확인해주세요.');
    const result=await client.rpc(WRAPPER);
    // An older server may not have this additive RPC yet. Never mask denial,
    // network failures, or a missing dependency inside an installed wrapper.
    return missingWrapper(result?.error)?client.rpc('df_measurement_company_scope'):result;
  }
  global.DFContractMultiScope=Object.freeze({request});
})(window);
