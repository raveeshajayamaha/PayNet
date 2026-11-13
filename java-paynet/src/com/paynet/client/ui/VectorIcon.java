package com.paynet.client.ui;
import javax.swing.*;
import java.awt.*;
import java.awt.geom.*;
/** Consistent 20px Java2D stroke icons; no font or image dependency. */
public class VectorIcon implements Icon {
    private final String kind;
    public VectorIcon(String k){kind=k;}
    public int getIconWidth(){return 20;} public int getIconHeight(){return 20;}
    public void paintIcon(Component c,Graphics g,int x,int y){Graphics2D p=(Graphics2D)g.create();p.translate(x,y);p.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);p.setColor(c.getForeground());p.setStroke(new BasicStroke(1.6f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND));
        switch(kind){
        case "send": Path2D a=new Path2D.Double();a.moveTo(2,3);a.lineTo(18,10);a.lineTo(2,17);a.lineTo(6,10);a.closePath();p.draw(a);p.drawLine(6,10,18,10);break;
        case "grid":for(int i=0;i<2;i++)for(int j=0;j<2;j++)p.drawRoundRect(2+i*9,2+j*9,6,6,2,2);break;
        case "refresh":p.drawArc(3,3,14,14,35,285);p.drawLine(17,2,17,7);p.drawLine(12,7,17,7);break;
        case "plus":p.drawRoundRect(2,2,16,16,5,5);p.drawLine(10,6,10,14);p.drawLine(6,10,14,10);break;
        case "logout":p.drawLine(3,3,3,17);p.drawLine(3,3,10,3);p.drawLine(3,17,10,17);p.drawLine(8,10,18,10);p.drawLine(14,6,18,10);p.drawLine(14,14,18,10);break;
        default:p.drawRoundRect(3,2,14,16,3,3);for(int i=6;i<16;i+=4)p.drawLine(6,i,14,i);
        }p.dispose();}
}
