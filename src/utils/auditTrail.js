// Audit Trail utility for logging all system actions

export const logAction = async (supabase, action, details, userId) => {
  if (!supabase || !userId) {
    console.warn('Cannot log action: missing supabase or userId');
    return;
  }

  try {
    const { error } = await supabase
      .from('audit_trail')
      .insert({
        user_id: userId,
        action: action,
        details: typeof details === 'string' ? details : JSON.stringify(details),
        timestamp: new Date().toISOString(),
      });

    if (error) {
      // Silently fail if table doesn't exist - this is expected during initial setup
      if (error.code !== '42P01') { // Table doesn't exist error code
        console.error('Failed to log action:', error);
      }
    }
  } catch (error) {
    // Silently fail - audit trail is non-critical
    console.warn('Error logging action (non-critical):', error.message);
  }
};
