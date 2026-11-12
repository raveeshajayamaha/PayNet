package com.paynet.client.ui;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.*;

/** Painted button with bounded hover animation and visible keyboard focus. */
public class ModernButton extends JButton {
    private final Color base;
    private float hover;
    private final Timer timer;
    public ModernButton(String text, String icon, Color color) {
        super(text, new VectorIcon(icon)); base=color;
        setForeground(Color.WHITE); setFont(Theme.font(14,true)); setIconTextGap(10);
        setContentAreaFilled(false); setBorder(new EmptyBorder(12,16,12,16)); setFocusPainted(false);
        setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        timer=new Timer(16,e->{ float target=getModel().isRollover()?1:0; hover+=(target-hover)*.3f; if(Math.abs(target-hover)<.02f){hover=target;((Timer)e.getSource()).stop();} repaint(); });
        addMouseListener(new MouseAdapter(){ public void mouseEntered(MouseEvent e){animate();} public void mouseExited(MouseEvent e){animate();} });
    }
    private void animate(){if(Boolean.getBoolean("paynet.reducedMotion")){hover=getModel().isRollover()?1:0;repaint();}else timer.start();}
    @Override public void removeNotify(){timer.stop();super.removeNotify();}
    @Override protected void paintComponent(Graphics g){Graphics2D x=(Graphics2D)g.create();x.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);Color c=isEnabled()?base:new Color(0x94A3B8);float f=getModel().isPressed()?.0f:hover*.15f;x.setColor(new Color((int)(c.getRed()+(255-c.getRed())*f),(int)(c.getGreen()+(255-c.getGreen())*f),(int)(c.getBlue()+(255-c.getBlue())*f)));x.fillRoundRect(0,0,getWidth(),getHeight(),12,12);if(isFocusOwner()){x.setColor(new Color(0x38BDF8));x.setStroke(new BasicStroke(2));x.drawRoundRect(2,2,getWidth()-5,getHeight()-5,10,10);}x.dispose();super.paintComponent(g);}
}
